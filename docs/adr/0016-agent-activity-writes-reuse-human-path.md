# Agent activity-writes reuse the human access path (verifyGoalAccess + shared service)

## Status

Accepted — 2026-06-14

## Context

The AI assistant (**Zoe**) needs to post an **Objective update** (`GoalUpdate`) or an
**Objective comment** (`GoalComment`) to an Objective's activity feed on the user's behalf —
the trigger was "write our high-level strategy and add it as an update to this goal", where
the user had to copy-paste Zoe's text into the composer by hand because no tool existed.

Two write-path shapes already exist in the codebase, and they disagree:

- **The human routers** `goalUpdate.addUpdate` / `goalComment.addComment` gate on
  `verifyGoalAccess` (the centralized 5-path resolver: workspace / team / project / owner /
  admin) and own the `GoalUpdate` health-sync transaction (writing `Goal.health` +
  `healthUpdatedAt`).
- **The legacy agent endpoints** in `mastra.ts` (`createOkrObjective`, `checkInOkrKeyResult`,
  …) instead (a) **duplicate** their transaction logic inline and (b) authorize with an
  inline `where: { id, userId }` **creator-only** check — narrower than what the user can do
  by hand, and contrary to CLAUDE.md's rule "never duplicate inline permission checks — use
  the centralized resolvers."

A new agent write-path could copy either shape. The activity feed is explicitly
multi-author and shared (it merges updates/comments from many workspace members), so the
choice directly determines whether Zoe can post to a team/shared Objective the user can edit
by hand but did not personally create.

## Decision

1. **Agent activity-writes mirror the human path exactly.** New `mastra.addGoalUpdate` /
   `mastra.addGoalComment` authorize with `verifyGoalAccess`, so Zoe can post wherever the
   user's own hands could (team / workspace / project / owner / admin) — no asymmetry.
2. **One shared service, called by both surfaces.** The create logic moves into
   `goalService` (`createGoalUpdate` / `createGoalComment`); the human routers and the
   mastra proxies both call it. The health-sync (`Goal.health` + `healthUpdatedAt`) cannot
   drift between the two surfaces because there is only one copy.
3. **Updates write the auto health, never the override.** The agent supplies a `health` for
   an update (inferring it, defaulting to the Objective's current value, and surfacing it in
   a draft for confirmation), writing the auto `Goal.health` column only — identical to the
   human Update tab, consistent with [ADR-0004](0004-okr-manual-status-override.md). The
   manual `healthOverride` remains the "Set status" CTA's job.
4. **We do not replicate the legacy inline-ownership / duplicate-logic pattern.** Those
   `mastra.ts` OKR endpoints are the divergent ones; they should converge onto this shape
   over time (flagged, not done here).

## Considered alternatives

- **Follow the existing mastra OKR precedent** (inline `{ id, userId }` + duplicated logic).
  Rejected: makes Zoe *more* restricted than the user's own hands (can't post to shared/team
  goals), violates the centralized-access rule, and risks the health-sync drifting from the
  human path.
- **Have the mastra proxy call the `goalUpdate`/`goalComment` tRPC procedures directly.**
  Rejected: tRPC procedures don't compose cleanly; a plain service function is the
  established services-layer boundary.
- **Let the agent write the manual `healthOverride` instead of the auto health.** Rejected:
  an update is a check-in, not an explicit human override; the override stays the deliberate
  "Set status" action (ADR-0004).

## Consequences

- A small refactor extracts `createGoalUpdate` / `createGoalComment` into `goalService`;
  the human routers are rewired to call them with no behavior change.
- Two new mastra endpoints + two new Mastra tools on Zoe (post objective update / post
  objective comment). Zoe chooses update vs comment, drafts, and confirms before posting.
- Updates are stored under the user's `authorId` (the agent acts as the user, the existing
  convention) — so attribution and the activity feed are unchanged from a hand-posted update.
- The legacy mastra OKR endpoints now visibly diverge from this shape; a future cleanup
  should move them onto `verifyGoalAccess` + shared services.
