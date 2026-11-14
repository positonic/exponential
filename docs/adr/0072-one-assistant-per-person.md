# One Assistant per person; extra Assistants are retired, never deleted

## Status

Accepted — 2026-10-11. Supersedes [ADR-0067](0067-assistant-is-an-owned-external-agent.md) §1
(one Assistant per user *per workspace*, its membership written at creation) and §3
(`assistant.delete` deletes the External agent). ADR-0067 §2, §4 and §5 stand. The decisions
were made in a grill-with-docs session and are recorded in `CONTEXT.md` under **Assistant**.
The full specification is in the PRD of the feature *Your Assistant across workspaces*.

## Context

`Assistant.workspaceId` is a single column, so a person who personalised "Zoe" in one
workspace found it absent everywhere else. The only fix available to them was a second
Assistant in the second workspace: a second persona to maintain, a second principal and a
second runner key, and two entries in the assignee picker for what the person thinks of as one
assistant. Several people already hold more than one.

Making the Assistant one per person means the extra ones must go. Deleting them is not an
option, for a reason that was verified rather than assumed: `AgentRun.agentId → ExternalAgent`
is `onDelete: Cascade`. Deleting an Assistant's principal deletes every Agent run it performed,
with its event log, and `TimeEntry.createdByAgentId` is `SetNull`, so its Agent-run time would
lose its author. `assistant.delete` did exactly that (ADR-0067 §3), with no caller yet.

## Decision

1. **At most one non-retired Assistant per person.** `Assistant.retiredAt` marks a retired
   row. A partial unique index enforces the rule in SQL, since Prisma cannot express it:
   `"Assistant_active_per_user_key" ON "Assistant"("createdById") WHERE "retiredAt" IS NULL`.
2. **Resolved without a workspace.** `resolveAssistantForUser(db, userId)` is the one resolver
   for chat, the gateways, settings and Agent runs. Retired rows are never resolved.
3. **Created on first need**, through `ensureAssistantForUser` alone, and named "Zoe" until its
   person renames it. "Zoe" is only that default name. Until a person has an Assistant, chat
   acts as them and no principal exists.
4. **Retired, never deleted** (`retireAssistant`). The Assistant row, its External agent and its
   shadow user are kept, so its history stays attributed to it and its persona text survives.
   Retirement:
   - revokes its keys;
   - removes its memberships, so it cannot be assigned;
   - unassigns it from open Actions;
   - cancels its live and waiting runs.
   Given a survivor, the memberships, the Positions held through them and the open assignments
   move to the survivor, and no run starts. `assistant.delete` now retires.
5. **The migration keeps the gateway default.** For each person:
   - a default Assistant in their default workspace;
   - else a default Assistant in a workspace they can still access;
   - else any Assistant in an accessible workspace;
   - else any Assistant.

   Ties go to the most recently edited (`planAssistantRetirement`). The rest are retired into
   the survivor. The same migration corrects agent memberships above `member` (ADR-0049 §3).
6. **A retired Assistant is never run-eligible.** Both eligibility filters
   (`enqueueAgentRunsForAssignees` and the reply-resume) require
   `assistant: { is: { retiredAt: null } }`, the shared `RUN_ELIGIBLE_AGENT_WHERE`, rather than
   the bare existence of an Assistant.

Membership becomes opt-in per workspace (the person adds their Assistant; their Personal
workspace is automatic). That lands with the V2 scope and does not change this decision.

## Considered options

- **Merge history onto the survivor.** Rejected: the record would say "Zoe" did work done under
  another name and persona.
- **Let people keep several Assistants and pick a survivor later.** Rejected: every code path
  would carry both shapes indefinitely.
- **Delete the extras.** Rejected on the `AgentRun` cascade above.
- **A per-workspace persona or "about me" override.** Rejected: it brings back the drift this
  removes. Workspace differences belong to AI instructions and Positions.

## Consequences

- The schema change ships as expand then contract. V1a (this change) adds `retiredAt`, the
  resolver, the migration and the index beside the per-workspace reads. V1b moves every caller
  and drops `Assistant.workspaceId` and `isDefault`.
- Until V1b, `assistant.create` refuses a person who already has an Assistant (`CONFLICT`)
  rather than making one per workspace.
- Every reader that treats "has an Assistant" as "may run" must check `retiredAt`. The display
  readers (Delegated, Waiting on me, the assignee roster, Positions) need nothing, because a
  retired Assistant holds no membership and no live run.
