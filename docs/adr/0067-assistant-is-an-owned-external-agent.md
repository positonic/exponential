# An Assistant is a principal: an owned External agent, not a bare shadow user

## Status

Accepted — 2026-10-09. Builds on [ADR-0049](0049-external-agents-first-class-principals.md)
(External agents as principals), [ADR-0061](0061-time-entries-belong-to-the-owner.md)
(agent-authored time) and [ADR-0016](0016-agent-activity-writes-reuse-human-path.md)
(Zoe acts as the user with draft-and-confirm — unchanged by this ADR).

## Context

A user wants to hand an Action to their Assistant and walk away. Two halves of that already
exist and neither is whole: the per-user, per-workspace **Assistant** (name, emoji, persona,
instructions, "about me") shapes Zoe's chat prompt but is not a principal, so nothing can be
*assigned* to it; and the **External agent** is a principal with a shadow user, keys and
workspace memberships, but has no persona and nothing runs it. The Assign Action modal papered
over the gap with two hardcoded fake agents that were discarded on save.

Three verified facts constrain how the Assistant becomes a principal:

- `TimeEntry.createdByAgentId` is a foreign key to `ExternalAgent`. There is no author link to
  `User`, so an Assistant's finished run can only write its Agent-run time (ADR-0061) if the
  Assistant *is* an External agent.
- The delegation-invariant cascades (`cascadeOwnerRemovedFromWorkspace`,
  `cascadeOwnerRoleChanged` in `services/externalAgentAccess.ts`) iterate "all of this owner's
  External agents". An Assistant modelled as a bare shadow user would need a second copy.
- The local runner (V2) authenticates with an `exp_agent_` key, which only `ExternalAgentKey`
  provides.

## Decision

1. **Every Assistant owns exactly one External agent** (`Assistant.externalAgentId`, unique,
   NOT NULL after backfill), whose `ownerId` is the Assistant's creator and whose shadow user
   is a `member` of the Assistant's workspace. `assistant.create` writes shadow user → External
   agent → membership → Assistant in one transaction. Existing Assistants are backfilled by the
   same migration; an Assistant whose owner no longer holds a non-viewer membership in that
   workspace gets its principal but **no** membership — the invariant wins.
2. **The Assistant is therefore an ordinary assignee.** The rosters behind the Assign modal
   already union `WorkspaceUser` rows; the shadow user appears once it is a member, labelled by
   owner through `User.externalAgentShadow.assistant.createdBy`. No new access path.
3. **Name follows the Assistant.** `assistant.update` propagates `name` to the shadow user and
   the External agent; `assistant.delete` deletes the External agent (the Assistant cascades).
   Assistant-backed External agents are managed from Settings → Assistant: the External agents
   page labels them and `externalAgent.delete` refuses them.
4. **Assignment starts an Agent run.** `ExternalAgent.executor` (`MASTRA` | `LOCAL_CLI`,
   default `MASTRA`) names the engine. The run model, its event log, the hosted executor and
   the Delegated inbox tab are specified in the feature's PRD and recorded in CONTEXT.md as
   **Agent run** and **Delegated**; they are deliberately not re-stated here.
5. **Zoe-in-chat is unchanged.** The drawer, canvas, voice and gateways keep acts-as-user with
   draft-and-confirm (ADR-0016). Only an *assigned* run acts as the Assistant's own principal,
   with every write attributed to its shadow user and `source = "agent"`.

## Considered options

- **Assistant → shadow user directly** (`Assistant.shadowUserId`). Rejected: duplicates the
  cascade plumbing, cannot author a `TimeEntry`, and leaves V2 without a credential.
- **Promote the Assistant table to be the External agent.** Rejected: External agents without a
  persona (Hermes-class third-party software) are a real product and would become a degenerate
  Assistant.
- **Keep the fake agents and route "AI" assignments to Zoe as the user.** Rejected: attributes
  unattended work to a human who did not do it (the ADR-0049 lie, again).

## Consequences

- An Assistant can be assigned work from any Assign surface with no new permission checks.
- Every Assistant creates two extra rows (User, ExternalAgent) and one membership; the External
  agents settings list must hide or label them.
- Deleting an Assistant now deletes a principal that may have authored content; the existing
  External agent delete path keeps the shadow user when restricted FKs reference it.
