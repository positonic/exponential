# Today's actions — a shared partition, distinct from the Daily brief

## Status

Accepted — 2026-06-29

## Context

A user on `/today` asked Zoe (in the chat drawer) to "mark the Malte ones done". Zoe **deflected** — "do you remember which project, or should I search your Notion workspace directly?" — which violates her contract on two axes ([CONTEXT.md](../../CONTEXT.md) "Thread score"): **Grounded** (call a tool for facts/actions, never fabricate or ask) and **No deflection** (the router persona's "never tell the user to check their own list"). By the **Failure lane** taxonomy this is primarily a `code_bug`: a tool Zoe needed was missing, with an `agent_behaviour` tail (the deflection).

The root cause is **discovery, not completion**. `action.update` already authorizes by action id via the central access service (`getActionAccess` + `canEditAction`), so completing an action works cross-workspace once Zoe has its id. But Zoe-the-brain's mastra toolset had **no way to list the user's actions for "today"**: she has `get-project-actions` (needs a project), `get-action-items` (meeting-scoped), and `get-today-calendar-events` (calendar, not actions). `/today` is deliberately **not** workspace-scoped and spans all workspaces, so a loose "Pay Malte" action was unreachable.

The obvious DRY fix — reuse `generateBriefingData` (which already backs voice's `get_todays_plan` coarse tool and is cross-workspace) — is a **trap**. That service defines "today" as `dueDate ∈ [todayStart, todayEnd]` (due-only), whereas `/today` (`useActionPartition`) defines it as **scheduled-or-due**: `scheduledStart` today, or no schedule and `dueDate` today, plus overdue and inbox. "Pay Malte" was **scheduled** (2:24 PM), not due — so a briefing-backed tool would have reproduced the exact bug.

## Decision

Give Zoe a dedicated **Today's actions** read tool whose definition is provably identical to what `/today` renders.

- **Extract the partition to a pure, server-shared function** (`partitionActions()` in `~/lib/actions/`). `useActionPartition` (client) and a new `action.getTodaysActions` tRPC procedure (server) both call it, so "what counts as today" agrees by construction — the one-source-of-truth pattern of [ADR-0007](0007-deterministic-action-extraction.md) and the **Weekly plan digest** extraction.
- **`action.getTodaysActions`** returns the three pre-partitioned groups (`overdue` / `today` / `inbox`), cross-workspace by default (optional `workspaceId` filter), each row carrying `{ id, name, status, scheduledStart, dueDate, projectName, workspaceName }`, capped defensively (~50/group) with total counts.
- **`get-todays-actions` mastra tool** calls it via `authenticatedTrpcCall`. Its **description is the behaviour driver**: fire on "today's actions / what's on my plate / these / those / them", return ids for completion, and **never ask which project or workspace**. No `zoe-agent.ts` instruction edit up front — revisit only if eval shows the description is insufficient.
- **Completion is unchanged** — Zoe calls the existing `update-action` (→ `action.update`, id-authorized) per returned id.
- **Capture an EvalCase** ([ADR-0013](0013-eval-replay-frozen-prefix.md)) from this Thread: frozen prefix "mark the Malte ones done", expectation "must call `get-todays-actions`, must not deflect" — so the fix is proven and the deflection is regression-guarded.

## Considered alternatives

- **Inline the on-screen list into ManyChat's page context.** Rejected — violates the established counts-only/fetch-via-tool convention (meetings/goals/projects), taxes ~1k+ tokens on every turn, goes stale mid-conversation, and only works while the user is physically on `/today` (not from the home drawer or "what's on my plate" anywhere). It also treats the symptom (awareness) not the cause (a missing tool).
- **Reuse `generateBriefingData` / voice's `get_todays_plan`.** Rejected — its **due-only** definition is narrower than `/today` and would still miss scheduled-but-not-due actions like "Pay Malte".
- **Converge voice onto the scheduled-or-due definition now.** Deferred — out of scope for this fix; the divergence is documented and convergence is a later, separate decision.
- **Edit `zoe-agent.ts` instructions to force tool use.** Deferred behind the tool description; the idiomatic Mastra mechanism is the tool's own description, and we measure via eval before adding prompt weight.

## Consequences

- New `partitionActions()` in `~/lib/actions/`; `useActionPartition` refactored to consume it (behaviour unchanged).
- New `action.getTodaysActions` tRPC procedure + a `get-todays-actions` tool in `../mastra`.
- **Two coexisting "today" definitions** are accepted for now: **Today's actions** (scheduled-or-due, the `/today` set and Zoe's chat tool) vs. the **Daily brief** (due-only, voice + morning briefing). Both are documented as canonical terms in CONTEXT.md; convergence of voice is explicitly deferred.
- A new EvalCase enters the regression suite guarding grounding/no-deflection for this class.
