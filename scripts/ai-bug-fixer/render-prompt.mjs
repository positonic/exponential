#!/usr/bin/env node
// @ts-check
/**
 * AI bug-fixer — prompt rendering.
 *
 * Turns the JSON of `exponential tickets get <id> --json` into a Markdown brief
 * the coding agent reads from disk. We deliberately keep the agent prompt SHORT
 * in the workflow ("read this file and fix it") and put all the ticket context
 * here, so the YAML stays clean and the brief is auditable in the run logs.
 *
 * Usage: node render-prompt.mjs --ticket ticket.json --out .ai-bug-fixer/prompt.md
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ticket = JSON.parse(readFileSync(arg("ticket"), "utf8"));
const out = arg("out", ".ai-bug-fixer/prompt.md");

const comments = Array.isArray(ticket.comments) ? ticket.comments : [];
const commentBlock = comments.length
  ? comments
      .slice() // newest-first from the API; show oldest-first for reading order
      .reverse()
      .map((c) => `- **${c.author?.name ?? "someone"}:** ${String(c.content ?? "").trim()}`)
      .join("\n")
  : "_(none)_";

const linkedActions = Array.isArray(ticket.actions) ? ticket.actions : [];
const actionBlock = linkedActions.length
  ? linkedActions.map((a) => `- ${a.name} (${a.status})`).join("\n")
  : "_(none)_";

// The worker is no longer bug-only, and the framing is not cosmetic: telling an
// agent to "make the smallest change that fixes the reported bug" when the
// ticket asks for a feature reliably produces a deliberate non-implementation.
// BUG keeps the narrow-fix framing; everything else asks for the change the
// ticket describes, still scoped to that ticket and nothing more.
const isBug = String(ticket.type ?? "BUG").toUpperCase() === "BUG";
const kind = isBug ? "Bug fix" : "Implementation";
const intro = isBug
  ? `You are an autonomous engineer fixing ONE bug in this repository. A human will
review your pull request before anything merges — your job is a correct,
**narrow** fix, not a refactor.`
  : `You are an autonomous engineer implementing ONE ticket in this repository. A
human will review your pull request before anything merges — your job is to
build exactly what this ticket describes, and nothing beyond it.`;
const scopeRule = isBug
  ? `Make the **smallest change** that fixes the reported bug. Do not refactor
   unrelated code, rename things, or reformat files you didn't need to touch.`
  : `Implement **only** what this ticket describes. Do not expand the scope,
   refactor unrelated code, rename things, or reformat files you didn't need
   to touch. If the ticket is ambiguous, choose the smallest reasonable
   interpretation rather than guessing at a bigger one.`;
const bailRule = isBug
  ? `If the bug is actually a security or data-loss issue, or you cannot fix it
   without a broad/risky change,`
  : `If this ticket turns out to be a security or data-loss concern, needs a
   database migration, or cannot be built without a broad/risky change,`;

const brief = `# ${kind} task — Ticket #${ticket.number ?? "?"}: ${ticket.title ?? ""}

${intro}

## Ticket (type: ${ticket.type ?? "unknown"})

${(ticket.body ?? "_(no description provided)_").trim()}

## Discussion / comments

${commentBlock}

## Linked actions

${actionBlock}

## Rules

1. ${scopeRule}
2. Follow this repo's conventions in \`CLAUDE.md\` — especially: NO hardcoded
   colors, use \`??\` not \`||\`, no \`any\`, proper \`import type\`, await all promises.
3. ${bailRule} **STOP**: leave a short note in a file named
   \`.ai-bug-fixer/needs-human.txt\` explaining why, and make no code changes.
4. Add or update a focused test when it's reasonable to do so.
5. If the ticket body is empty or too vague to act on, do **not** guess — STOP
   and write \`.ai-bug-fixer/needs-human.txt\` saying what you'd need to know.
6. Do **not** run git, commit, push, or open a PR — the workflow handles that.
   Just edit the working tree.

When done, the workflow runs \`npx tsc --noEmit\` and \`npx next lint\`; your change
must pass both.
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, brief);
console.log(`[ai-bug-fixer] wrote prompt for #${ticket.number ?? "?"} → ${out} (${brief.length} chars)`);
