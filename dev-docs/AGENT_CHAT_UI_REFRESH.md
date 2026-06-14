# Agent chat → UI refresh: invalidating page data after Zoe writes

When Zoe (the in-app agent / `ManyChat`) performs a **write** via a tool, the
write happens server-side (chat stream → mastra → tRPC). Any page data showing
that entity lives in a **separate** component with its own React Query cache, so
it stays stale until a manual reload. This note records the approach so the next
person hitting it doesn't rediscover it.

## Why not an ADR

By this repo's ADR test (all three must hold: hard to reverse, surprising without
context, real trade-off with rejected alternatives), this **doesn't qualify** —
it's a small, easily-reversed client convention. So it lives here as a how-to with
a short decision note, not in `docs/adr/`. If this ever grows into a generic
server-driven invalidation layer (Option B below), *that* would warrant an ADR.

## The mechanism (works across the component tree)

tRPC/React Query invalidation is **not** component-scoped: the cache is one
app-wide `QueryClient` (`src/trpc/react.tsx`). Invalidating a query key from
`ManyChat` (right pane) refetches every mounted subscriber of that key —
including a feed rendered in a sibling component (left pane). No parent/child
relationship needed. This is the same `invalidate()` the composer already calls
on its own mutations (`src/hooks/useGoalActivity.ts` → `invalidate`).

## How it's wired today (the goal-activity case)

First (and currently only) case: Zoe posting an **Objective comment/update**.

- `ManyChat` parses `__exp_tool__` tool frames during streaming into a
  `toolCallsById` Map (entries typed `ToolCall` — `name` + `status` —
  `src/providers/AgentModalProvider.tsx`).
- After the stream completes (just after `setIsStreaming(false)` in
  `src/app/_components/ManyChat.tsx`), it checks the **succeeded** tool calls and,
  if the user is on a goal page (`pageContext?.pageType === 'goal'`) and a tool
  matched, invalidates the goal-activity queries.
- The brittle bit — the tool name reaches the client as the registration key
  (`addObjectiveUpdateTool`), the createTool id (`add-objective-update`), or a
  humanized label ("Add objective update") — is isolated in a pure, unit-tested
  helper: `src/app/_components/manyChatToolRefresh.ts`
  (+ `manyChatToolRefresh.test.ts`). Test the matcher, not the React glue.
- It invalidates the **same key set** as `useGoalActivity.invalidate()`:
  `goalActivity.getFeed`, `goalActivity.getCount`, `goal.getById`
  (feed + count badge + health badge), procedure-wide (no args) to dodge
  goalId-source fragility. Fires **only** on the success path.

## Adding a new case (the narrow way we use now)

1. Add/extend a matcher (mirror `toolTriggersGoalActivityRefresh`) for the new
   tool name(s), with a unit test across the name forms.
2. In `ManyChat`'s post-stream block, add a branch: if a matching tool succeeded
   (and, if page-specific, the right `pageContext.pageType`), call
   `utils.<router>.<procedure>.invalidate()` for the queries that page reads —
   reuse the page's existing hook invalidation set, don't invent keys.

## If this grows: two generalizations (decision: stay narrow for now)

We deliberately kept it narrow (two tools). If many write-tools appear:

- **Option A — client refresh registry.** Replace the `if` with a declarative
  table of `{ when(toolName), pageType?, invalidate(utils) }` rows; after the
  stream, run matching rows for each succeeded tool. Generic engine, but
  registration is still manual (forget a row → silent staleness).
- **Option B — server-tagged invalidation.** `/api/chat/stream` (same repo as the
  tRPC routers) attaches an `invalidate: [...]` list to the tool/meta frame from a
  server-side tool→queries map; `ManyChat` blindly applies it via a name→`utils`
  resolver. The coupling lives next to the routers; the client needs zero per-tool
  knowledge. More plumbing — worth it only at scale, and would get an ADR.

We did **not** add realtime infra (websockets/SSE-for-data/polling) — the app has
none, and client invalidation after the chat stream is the right-sized fix.

## Pointers / grep anchors

- `manyChatToolRefresh` — the matcher + test
- `ManyChat.tsx` post-stream block (after `setIsStreaming(false)`)
- `useGoalActivity.ts` → `invalidate` — the canonical key set to mirror
- `src/trpc/react.tsx` — the single app-wide `QueryClient`
