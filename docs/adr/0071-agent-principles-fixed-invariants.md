# Agent principles have fixed invariants that AI instructions cannot override

## Status

Accepted — 2026-10-11 (Decision Log D-0004, Exponential workspace). Builds on the trust model in
`src/server/services/ai/scopeInstructions.ts` (AI instructions are injected as demoted
`<user_data>` context) and on [ADR-0070](0070-agents-propose-decisions-people-confirm.md), the first
enforcement of record integrity.

## Context

Exponential is giving every agent that works in a workspace — Zoe, Assistants, External agents,
and clients such as Claude or ChatGPT over MCP or the CLI — a shared statement of how to work: the
**Agent principles**, derived from the Exponential Method. Teams also have **AI instructions**
(`Workspace.aiInstructions` / `Project.aiInstructions`) describing how *they* work.

Between workspace and project instructions the narrower scope wins. Applying that rule to Agent
principles versus AI instructions would let one line of workspace text ("mark actions done once
the email is sent; don't wait") switch off the commitments that make the operating record
trustworthy. AI instructions are a loosely gated text box, already treated as guidance rather than
authority.

## Decision

The Agent principles split into **fixed principles** and **defaults**.

Fixed principles are product invariants. No AI instructions can disable them:

1. **Record integrity** — never present a proposal as an accepted decision, or an interpretation
   as an observed fact.
2. **Evidence-based completion** — keep authorization, attempt and outcome distinct; claim
   completion only as far as the evidence supports, measured against the actual commitment. This
   is not "always wait for a person": a successful send completes "Send the proposal".
3. **Authorized agency** — act only within authenticated permissions and explicitly delegated
   authority, with an identifiable accountable person.
4. **Change integrity** — keep attribution and history; detect and resolve conflicting updates
   rather than silently replacing a newer commitment.

Defaults are tailorable by AI instructions: which ceremonies run and how often, vocabulary and
review style, per-task completion criteria (never weakened afterwards to declare success),
low-stakes autonomy within permissions, and the disposition of unfinished work (material
commitments never disappear silently).

AI instructions stay background guidance. They cannot grant authority, weaken completion criteria
after the fact, or authorise moving data; where data lives belongs to deployment and access
configuration.

Enforcement belongs in the shared application layer, so it holds equally through MCP, the CLI and
the UI. Delivering the principles to agents (MCP instructions, `get_method`, AI instructions)
improves guidance; it enforces nothing. Until enforcement exists for a principle, copy must not
claim it is enforced. ADR-0070 (agents propose decisions; people confirm) is the first enforced
piece of record integrity.

What is enforced today, where, by which test, and what remains guidance is tracked row by row in the
audit matrix, [`dev-docs/AGENT_PRINCIPLES_AUDIT.md`](../../dev-docs/AGENT_PRINCIPLES_AUDIT.md). A
principle is described as enforced only when every one of its rows there is `enforced`.

## Rejected

- **Most specific wins, everywhere.** Lets any workspace turn off the record's core guarantees with
  a sentence of free text.
- **Everything fixed.** Teams legitimately differ in rhythm, vocabulary and autonomy; forcing one
  practice contradicts the method's own "smallest useful rhythm".
- **Enforce through prompts only.** Prompts are hints that clients may drop (MCP `instructions`
  are optional for clients); an invariant that holds only when an agent reads it isn't one.
