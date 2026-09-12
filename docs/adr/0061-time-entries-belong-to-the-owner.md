# Time entries belong to the owner even when an External agent writes them

## Status

Accepted — 2026-09-12. Amends [ADR-0049](0049-external-agents-first-class-principals.md) point 7 for one resource.

## Context

ADR-0049 makes an External agent a first-class principal: its writes attribute to its shadow
`User` (`createdById`), never to the human who owns it, because "James created this action"
while James was asleep is a lie. That rule is right for work the agent does.

A time entry is not work the agent does. The Daily worklog reads yesterday's Claude Desktop
conversations and records how the *owner* spent the day; the agent is the scribe. Under the
ADR-0049 rule the row would belong to the shadow user, and every surface that shows a person's
time — the `/time` page, week totals, project and product roll-ups — keys on `TimeEntry.userId`,
so the owner's day would never appear as theirs.

## Decision

For `TimeEntry` only, an External agent may write a row whose `userId` is its **owner**. The
carve-out is honest because the row records two facts separately: *whose time* (`userId`) and
*who wrote it* (`createdByAgentId`, plus `source`). Every agent-written entry is created as
**Proposed** and stays visibly so until the owner confirms it, and manual time always wins over
it (see **Proposed time** and **Manual time** in `CONTEXT.md`).

The carve-out is keyed on the resource, not the token: no other router gains the ability to
write on the owner's behalf, and the agent still cannot read or write time that is not its
owner's.

## Considered options

- **The agent owns the row until the owner adopts it.** Purest reading of ADR-0049. Rejected:
  nothing shows on the owner's `/time` until they act, and "adopt" is a new ownership-transfer
  mutation with no other use.
- **Run the routine as the owner.** No schema change. Rejected: an autonomous scheduled task
  would hold the owner's own credentials, which is exactly the posture ADR-0049 exists to end.
- **A separate `Worklog` entity, not `TimeEntry`.** Keeps ADR-0049 untouched. Rejected: it
  duplicates the roll-up (Action → Ticket / Project → Product) and the `/time` reports, and
  invites the two stores to disagree.

## Consequences

- `TimeEntry` gains `createdByAgentId` and a status (`PROPOSED | CONFIRMED`). Agent-written
  entries are never `CONFIRMED` on creation.
- `Action.timeSpentMins` is incremented only when an entry is confirmed, so proposed time cannot
  pollute estimates.
- Agent-run time (an agent working with no human turns) is *not* covered by this carve-out. It is
  stored as its own kind of entry on the same Action and excluded from the owner's attention
  totals; whose row it is remains the agent's, per ADR-0049.
- The members list and activity feed keep showing the agent badge on these writes, as ADR-0049
  point 7 requires; the badge now reads "wrote", not "worked".
