# An agent saves to its owner's Reading list, inside the workspaces delegated to it

## Status

Accepted — 2026-11-01. Amends [ADR-0049](0049-external-agents-first-class-principals.md) point 7
for a second resource, after [ADR-0061](0061-time-entries-belong-to-the-owner.md) did it for time.

## Context

"Save this to my reading list" is one of the first things anyone asks a bot. Under ADR-0049 a
bot's `exp_agent_…` key resolves to its shadow user, and every `resource.*` procedure keyed
ownership on the caller, so the save landed on the shadow user's list, which nobody sees
(GitHub issue #1001: nine links saved this way, all invisible to their owner). The only
workaround was handing the bot its owner's own token, which is the posture ADR-0049 exists to
end.

## Decision

A Resource is a **personal store an agent keeps for someone**, like their time. Under an agent
principal (`resolvePrincipal` → `kind: "agent"`, so an External agent's key and an Assistant
alike), `resource.*` works on the **owner's** rows:

- A save is owned by the owner (`userId`) and records the writer (`createdByAgentId`). No
  Proposed state: a reading-list save is low-stakes and reversible, and the person handing over
  the link is the confirmation.
- The agent reaches only the owner's rows **in workspaces the owner delegated to it** (its own
  `WorkspaceUser` rows). The owner's no-workspace rows, and rows in workspaces the agent was
  never granted, are out of reach for read, write and URL dedupe alike; a save must name a
  delegated workspace. Workspace and project gates must admit both the agent and the owner.

The carve-out is keyed on the resource, as in ADR-0061. A third personal store gets its own
decision, not a quiet copy of this one.

## Considered options

- **Hand the bot the owner's token.** Rejected: an unrevocable credential on hardware the owner
  doesn't control, and every write would claim the owner did it.
- **Scope to every row the owner has.** Rejected: delegation is per workspace (ADR-0049 point
  3); a key granted one workspace would read the owner's list across all of them.
- **A Proposed state the owner confirms.** Rejected for now: a confirm step on a bookmark is
  friction with no matching risk. Revisit if agents start saving unasked.

## Consequences

- `Resource` gains `createdByAgentId` (FK to `ExternalAgent`, `SET NULL`). The migration hands
  rows already sitting on a shadow user to the owner, unless the owner saved the same URL.
- A URL the owner saved outside the agent's workspaces can be saved again by the agent as a
  second row; dedupe does not cross the delegation boundary.
