# Agent writes refresh the UI via a client-side tool-name rule registry

## Status

Accepted — 2026-06-16

## Context

When the in-app assistant (**Zoe**, surfaced in the chat drawer via the ManyChat stream)
creates, updates, moves, or deletes an entity on the user's behalf, the affected views render
in sibling components with their own React Query caches. They stay stale until the user reloads
the page — the assistant says "all set" but nothing visibly changes.

[ADR-0016](0016-agent-activity-writes-reuse-human-path.md) covers the *write* side (agent
activity-writes reuse the human access path). This ADR is its *refresh* sibling: how the client
knows what to re-fetch after an agent write settles.

A first version handled exactly one case inline in `ManyChat.tsx`: on a goal page, if any
successfully-executed tool name matched the objective comment/update matcher, invalidate the
goal-activity feed/count/goal. The user then asked for the same liveness for **Actions** on
`/today` (and the project board, calendar, score widgets), and — explicitly — for the mechanism
to be a *reusable pattern* for future pages, not another bespoke `if` block each time.

The tool name that reaches the client is brittle: the chat stream emits the registration key
(`createActionTool`), the createTool id is `create-action`, and the UI humanizes it to
"Create action". The matching is the part most likely to drift, so it is the part worth
isolating and unit-testing.

## Decision

1. **A pure rule registry owns the matching.** `manyChatToolRefresh.ts` exposes per-entity
   tool-name matchers and a single function `entitiesToRefresh(toolNames, pageType?) ->
   Set<RefreshEntity>`, where `RefreshEntity` is currently `'goalActivity' | 'action'`. The
   registry is a small table of rules `{ entity, matches(toolName), requiresPageType? }`.
2. **`goalActivity` keeps its `requiresPageType: 'goal'` guard** — the goal feed is a sibling
   component only mounted on goal pages; behaviour is unchanged. **`action` has no page guard** —
   Actions surface on many pages, and invalidation only refetches *mounted* observers, so firing
   unconditionally is near-free.
3. **The chat component owns the wiring, not the matching.** After the response stream settles,
   ManyChat collects the names of successfully-executed tools, calls `entitiesToRefresh`, and
   invalidates per returned entity. For `action` that is the full canonical Action set,
   procedure-wide (no args): `getAll`, `getToday`, `getScheduledByDate`,
   `getScheduledByDateRange`, `getProjectActions`, plus `scoring.getTodayScore` and
   `scoring.getProductivityStats` — mirroring the hand-written create/update/bulk mutation
   invalidation sets, so create, update, move, and delete all refresh every surface.
4. **Adding a future entity = one matcher + one rule (+ its unit test).** The matchers are pure
   functions with a fast, no-DOM unit suite (the existing goal-activity matcher test is the
   template).

## Considered alternatives

- **A server-emitted invalidation protocol over the chat stream.** Rejected: a cross-repo
  stream-protocol change that duplicates knowledge the tool names already carry. The client
  already sees which tools ran; deriving the refresh set from them needs no new wire contract.
- **Keep hand-written inline `if` blocks per entity.** Rejected: that is the bespoke-per-page
  pattern the user explicitly asked to replace, and it scatters the brittle matching logic
  across React glue where it can't be unit-tested.
- **Args-scoped invalidation (e.g. invalidate only the touched goalId/projectId).** Rejected as
  the default: deriving the right args from tool output is fragile (source/coercion drift), and
  procedure-wide invalidation only refetches mounted observers, so the breadth is cheap.

## Consequences

- Agent-created/updated/deleted Actions appear live on `/today`, the project board, the
  calendar, and the score/productivity widgets with no reload.
- The existing goal-activity refresh is unchanged (still goal-page-guarded).
- The matching logic is centralized and unit-tested; regressions are caught cheaply.
- Only Actions and Objective activity are wired today; other entities are a one-rule addition
  when needed.
