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
principles versus AI instructions would let one line of workspace text ("mark the Action complete
as soon as you've tried to send it, even if the send failed or its outcome is unknown") switch off
the commitments that make the operating record trustworthy. AI instructions are a loosely gated text box, already treated as guidance rather than
authority.

## Decision

The Agent principles split into **fixed principles** and **defaults**.

Fixed principles are product invariants. No AI instructions can disable them:

1. **Record integrity** — never present a proposal as an accepted decision, or an interpretation
   as an observed fact.
2. **Evidence-based completion** — keep authorization, attempt and outcome distinct; claim
   completion only as far as the evidence supports, measured against the actual commitment. This
   is not "always wait for a person": a successful send completes "Send the proposal". Equally, a
   person confirming completion is approval, not evidence that the promised outcome occurred.
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
the UI — and it covers what the application can actually guarantee: permissions, lifecycle
transitions, required evidence fields, attribution, and conflict checks on persisted records and
operations. It cannot guarantee that an agent's conversational prose never presents an
interpretation as fact, nor that a supplied evidence field truly proves completion; those parts
remain guidance. Each principle is therefore tracked in an audit matrix (principle → governed
operations → enforcement → tests → remaining limits), and copy may call a rule enforced only once
tests cover it. Delivering the principles to agents (MCP instructions, `get_method`, AI
instructions) improves guidance; it enforces nothing. ADR-0070 (agents propose decisions; people
confirm) is the first enforced piece of record integrity.

**Known limit — identity.** Enforcement that distinguishes agents from people depends on the
server knowing which principal is acting. An agent key is verifiable; a `source: AGENT` label is
not, and an agent running with a person's credential is indistinguishable from that person. Where a
workflow deliberately does that — the grilling skills' closing step confirms decisions with the
developer's own CLI login after explicit consent in chat (Decision Log D-0013) — the guarantee is
procedural (consent step plus a narrow hook gate), not enforced. The target is for agents always to
act under their own identity, recording a person's conversational decisions under an explicit,
revocable delegation with the person's words quoted as evidence.

## Rejected

- **Most specific wins, everywhere.** Lets any workspace turn off the record's core guarantees with
  a sentence of free text.
- **Everything fixed.** Teams legitimately differ in rhythm, vocabulary and autonomy; forcing one
  practice contradicts the method's own "smallest useful rhythm".
- **Enforce through prompts only.** Prompts are hints that clients may drop (MCP `instructions`
  are optional for clients); an invariant that holds only when an agent reads it isn't one.
