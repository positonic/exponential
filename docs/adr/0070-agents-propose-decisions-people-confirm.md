# Agents propose decisions; people confirm them

## Status

Accepted — 2026-10-11. Extends [ADR-0060](0060-decisions-beside-adrs-one-log.md) §4 ("extraction
produces drafts, and a human confirms") to every agent-authored Decision. Keeps
[ADR-0016](0016-agent-activity-writes-reuse-human-path.md)'s single service path.

## Context

`decision.create` always wrote `reviewState: CONFIRMED` with `confirmedById` set to the creator. An
agent principal (an Assistant's shadow user, an External agent key) or Zoe logging with
`source: AGENT` could therefore publish an `ACCEPTED` decision to the Decision Log that it had
"confirmed" itself. Extracted meeting decisions already needed a person to confirm them; decisions an
agent logged directly skipped that step.

## Decision

- A Decision created by an agent principal (`User.isAgent`, or an `agent-key` token) or with
  `source: AGENT` is born a **draft**, with no confirmer and no activity event. The router stays
  `protectedProcedure`, so agents still write through the human path (ADR-0016), but only as drafts.
- `confirmDraft` is **human-only**. `confirmedById` is always a person.
- A meeting-less draft is visible to the people who can **edit** it, since they are the ones who can
  confirm it. It still never reaches a bulk read (the Decision Log, counts, feature or ADR lists).
  Its reviewer finds it under the Inbox's "Draft decisions to review": the owner of the agent that
  logged it, or the person Zoe was acting for.
- An `OPEN` question gets no default decider, and an agent is never defaulted in as one.

## Rejected

- **Agents publish, with an "AI" badge.** The Log would still show unconfirmed choices as decided.
- **Agent writes human-only.** This would break ADR-0016: Zoe and Assistants couldn't record a
  decision at all.
