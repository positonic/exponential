#!/usr/bin/env node
// @ts-check
/**
 * AI bug-fixer — candidate selection.
 *
 * Pure, dependency-free. Given the JSON output of two `exponential tickets list`
 * calls, decides which single bug (if any) the worker should attempt this run.
 *
 * Eligibility (server-side filters are applied by the CLI before this runs):
 *   - status = READY_TO_PLAN and one of the trigger labels (the candidates sets)
 * Exclusions (applied here — the safety gate):
 *   - any ticket also carrying the `security` label  (the exclude set)
 *   - any ticket with priority 0 (critical)
 *   - if the number of already-open AI PRs is at/above the cap, select nothing
 *
 * Among survivors, picks the OLDEST by createdAt (FIFO — oldest waiting longest).
 *
 * TWO trigger labels, not one. `--label` on the CLI is AND-only, so "ai-fixable
 * OR ai-buildable" cannot be one query — the workflow runs one list per label
 * and passes each file here. `--candidates` is therefore REPEATABLE, and each
 * one is paired with the `--candidate-label` of the same index so the chosen
 * ticket can report which profile it matched. A ticket carrying both labels is
 * deduped to its first (bug-fix) match, which is the stricter profile.
 *
 * Usage:
 *   node select-candidate.mjs \
 *     --candidates fixable.json  --candidate-label ai-fixable \
 *     --candidates buildable.json --candidate-label ai-buildable \
 *     --exclude sec.json [--open-prs 1] [--max-open-prs 3] [--only-ticket <id>]
 *
 * Writes the chosen ticket to `chosen.json` (cwd) and, when running under GitHub
 * Actions, emits `found`, `ticket_id`, `ticket_number`, `ticket_title`,
 * `branch_slug`, `trigger_label` to $GITHUB_OUTPUT. Exit code is always 0 —
 * "nothing to do" is a normal outcome, not a failure.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

/** @param {string} name @param {string=} fallback */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** All values of a repeatable flag, in the order given. @param {string} name */
function args(name) {
  /** @type {string[]} */
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
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

// Merge every --candidates file, stamping each ticket with the label whose
// query produced it. First match wins on dedupe: a ticket carrying BOTH labels
// is worked as `ai-fixable`, the stricter (narrow-fix) profile.
const candidateFiles = args("candidates");
const candidateLabels = args("candidate-label");
/** @type {Map<string, any>} */
const byId = new Map();
candidateFiles.forEach((file, i) => {
  for (const t of readTickets(file)) {
    if (!byId.has(t.id)) byId.set(t.id, { ...t, triggerLabel: candidateLabels[i] ?? "" });
  }
});
const candidates = [...byId.values()];
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
    return {
      chosen: null,
      reason: `no eligible tickets (${candidateLabels.join("/") || "no labels queried"} + READY_TO_PLAN, minus security/critical)`,
    };
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
setOutput("trigger_label", String(chosen.triggerLabel ?? ""));
console.log(
  `[ai-bug-fixer] chosen: #${chosen.number ?? "?"} ${chosen.title} (${chosen.id}) via ${chosen.triggerLabel || "?"}`,
);
