#!/usr/bin/env node
// @ts-check
/**
 * AI bug-fixer — candidate selection.
 *
 * Pure, dependency-free. Given the JSON output of two `exponential tickets list`
 * calls, decides which single bug (if any) the worker should attempt this run.
 *
 * Eligibility (server-side filters are applied by the CLI before this runs):
 *   - type = BUG, status = READY_TO_PLAN, label = `ai-fixable`  (the candidates set)
 * Exclusions (applied here — the safety gate):
 *   - any ticket also carrying the `security` label  (the exclude set)
 *   - any ticket with priority 0 (critical)
 *   - if the number of already-open AI PRs is at/above the cap, select nothing
 *
 * Among survivors, picks the OLDEST by createdAt (FIFO — oldest bug waiting longest).
 *
 * Usage:
 *   node select-candidate.mjs --candidates cand.json --exclude sec.json \
 *     [--open-prs 1] [--max-open-prs 3] [--only-ticket <id>]
 *
 * Writes the chosen ticket to `chosen.json` (cwd) and, when running under GitHub
 * Actions, emits `found`, `ticket_id`, `ticket_number`, `ticket_title`,
 * `branch_slug` to $GITHUB_OUTPUT. Exit code is always 0 — "nothing to do" is a
 * normal outcome, not a failure.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

/** @param {string} name @param {string=} fallback */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Tolerate both `[...]` and `{ tickets: [...] }` shapes from the CLI. */
function readTickets(path) {
  if (!path) return [];
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.tickets) ? raw.tickets : [];
  return list;
}

function setOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `${key}=${value}\n`);
}

function slugify(title) {
  return String(title || "fix")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "fix";
}

const candidates = readTickets(arg("candidates"));
const excludeIds = new Set(readTickets(arg("exclude")).map((t) => t.id));
const onlyTicket = arg("only-ticket"); // manual workflow_dispatch override
const openPrs = parseInt(arg("open-prs", "0"), 10) || 0;
const maxOpenPrs = parseInt(arg("max-open-prs", "3"), 10) || 0;

function pickReason() {
  if (maxOpenPrs > 0 && openPrs >= maxOpenPrs) {
    return { chosen: null, reason: `cap reached: ${openPrs}/${maxOpenPrs} AI PRs already open` };
  }

  let pool = candidates.filter((t) => {
    if (excludeIds.has(t.id)) return false; // `security`-labelled
    if (t.priority === 0) return false; // critical
    return true;
  });

  if (onlyTicket) {
    pool = pool.filter((t) => t.id === onlyTicket);
    if (pool.length === 0) {
      return { chosen: null, reason: `requested ticket ${onlyTicket} is not eligible (missing, excluded, or critical)` };
    }
  }

  if (pool.length === 0) {
    return { chosen: null, reason: "no eligible bugs (ai-fixable + READY_TO_PLAN, minus security/critical)" };
  }

  pool.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return { chosen: pool[0], reason: `selected oldest of ${pool.length} eligible` };
}

const { chosen, reason } = pickReason();

console.log(`[ai-bug-fixer] candidates=${candidates.length} excluded=${excludeIds.size} → ${reason}`);

if (!chosen) {
  setOutput("found", "false");
  process.exit(0);
}

writeFileSync("chosen.json", JSON.stringify(chosen, null, 2));
setOutput("found", "true");
setOutput("ticket_id", chosen.id);
setOutput("ticket_number", String(chosen.number ?? ""));
setOutput("ticket_title", String(chosen.title ?? "").replace(/\n/g, " "));
setOutput("branch_slug", slugify(chosen.title));
console.log(`[ai-bug-fixer] chosen: #${chosen.number ?? "?"} ${chosen.title} (${chosen.id})`);
