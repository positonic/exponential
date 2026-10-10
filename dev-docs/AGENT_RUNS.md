# Agent Runs — assigning work to an Assistant

How an **Assistant** becomes an assignee, what happens when an Action is assigned to it, and where every piece lives. Decisions: [ADR-0067](../docs/adr/0067-assistant-is-an-owned-external-agent.md) (the Assistant is an owned External agent), [ADR-0049](../docs/adr/0049-external-agents-first-class-principals.md) (External agents as principals), [ADR-0061](../docs/adr/0061-time-entries-belong-to-the-owner.md) (agent-authored time), [ADR-0016](../docs/adr/0016-agent-activity-writes-reuse-human-path.md) (Zoe-in-chat acts as the user — unchanged). Vocabulary: CONTEXT.md **Assistant**, **Agent run**, **Delegated**, **External agent**, **Agent-run time**. The feature's PRD (Exponential page `cmv1cyv6d000dl906n74e04zd`, section "Agent PRD") is the design source; this document is the as-built map.

## The three kinds of agent, in one table

| | Zoe in chat | Assistant (assigned) | External agent (self-driving) |
|---|---|---|---|
| Who it acts as | **You** (ADR-0016, draft-and-confirm) | **Its own principal** — the Assistant's shadow user | Its own principal — the agent's shadow user |
| Credential | Your session | An `agent-context` JWT the app mints per run, carrying a `runId` claim | An `exp_agent_…` key the owner created in Settings → Agents |
| What starts work | You type | **Assigning an Action to it** creates an `AgentRun`; the app runs it | The software itself polls `actions list` and picks up what is assigned to it |
| Who executes | Mastra `assistantAgent`, streamed to the drawer | Mastra `assistantRunAgent` via the app's dispatcher (`executor = MASTRA`); V2 adds `LOCAL_CLI` | Whatever the owner runs (Hermes, a Grok Bot, a script) |
| Writes | Attributed to you, confirmed in chat | Attributed to the shadow user, `source = "agent"`, only inside Exponential | Attributed to the shadow user, whatever the key allows |
| Completes the Action? | You do | **Never** — it proposes (`readyToClose`), the owner confirms | Yes, if it wants to (today's convention: In Progress → In Review → Done via kanban) |
| Asks for help | In the chat | `ask-owner` comment with a mention; the run pauses, the owner's reply resumes it | Comments and @mentions by convention |
| Visible progress | Chat stream | Title spinner, "Working 1m · called N tools" pill, owner-only transcript, Delegated inbox tab | Comments and status changes |

**The gate that keeps these apart:** `enqueueAgentRunsForAssignees` only creates a run for a principal whose External agent has an `assistant` (`assistant: { isNot: null }`). Assigning a plain External agent starts **no** hosted run, so a self-driving bot is never double-worked by the dispatcher. V2 widens hosted-run eligibility to agents whose `executor` is `LOCAL_CLI`, where the owner's own runner claims the run instead of polling actions.

## Data model

```
Assistant 1──1 ExternalAgent 1──1 User(isAgent)        (ADR-0067: the principal)
                 │  executor: MASTRA | LOCAL_CLI
                 └──< AgentRun >── Action
                         │  status: QUEUED → RUNNING → SUCCEEDED | FAILED | WAITING_ON_OWNER | TIMED_OUT
                         │          QUEUED → CANCELLED, RUNNING → CANCELLED (flag)
                         │  requestedById, predecessorId, wakeCommentId, startedAt, finishedAt,
                         │  lastEventAt (heartbeat), toolCallCount, summary (public), readyToClose,
                         │  error, usage, reviewedAt/reviewedById (Delegated)
                         └──< AgentRunEvent  (seq monotonic per run; kind: status | tool_call |
                                              tool_result | text | log | error; payload JSON)
```

- **Live set** = `QUEUED, RUNNING` (`services/agentRuns/constants.ts`). The title spinner, the pill's "Working" and the 2 s poll all key off it.
- **One live run per (action, agent)**: enforced by the partial unique index `AgentRun_live_action_agent_key` (migration `20261010100000_agent_run_live_unique`); the enqueue helper treats the resulting P2002 as "already running". `WAITING_ON_OWNER` is terminal for its row — a resume is a **new** row with `predecessorId` + `wakeCommentId` — so it is excluded from the index.
- **No `Action.activeRunId` column.** `activeRunInclude` (`services/agentRuns/include.ts`) adds the live run to `action.getById` and the list queries behind `ActionRow`; `withActiveRun` exposes it as `activeRun`.

## Lifecycle

1. **Assign** (`action.assign`, `bulkAssign`, the run tool `reassign-action`, and `actionComment.addComment` for resumes) → `enqueueAgentRunsForAssignees` / `resumeWaitingRunsOnOwnerReply` (`services/agentRuns/enqueue.ts`). Skips humans, plain External agents, parked (`BACKLOG`/`DONE`) or completed actions, and anything with a live run. Then `after(() => triggerDispatch())` so the mutation never waits on Mastra.
2. **Dispatch** (`POST /api/internal/agent-runs/dispatch`, `services/agentRuns/dispatch.ts`): fail-closed `CRON_SECRET`, `maxDuration = 300`. Claims **one** `QUEUED` run with `updateMany({ where: { id, status: "QUEUED" } })` (count must be 1), mints `generateJWT(shadowUser, { tokenType: "agent-context", extraClaims: { runId } })`, and POSTs `${MASTRA_API_URL}/api/agents/assistantRunAgent/generate` with: the persona system message built exactly like `/api/chat/stream` does (`buildPersonaMessage`), the action brief (`buildActionBrief`, including predecessor summary and wake comment on a resume), `requestContext { authToken, userId: shadowUserId, ownerUserId, workspaceId, runId }`, and `memory: { resource: shadowUserId, thread: { id: "action-<actionId>" } }` (thread-scoped so nothing leaks between actions). The fetch is bounded by `AbortSignal.timeout(270_000)`.
3. **Callbacks** (`routers/mastra.ts`, section "Agent run callbacks"): the run tools in the mastra repo call `mastra.getRunContext` (query, pure read), `reportProgress`, `commentOnAction`, `reassignAction`, `askOwner`, `finishRun`. Every one resolves its run through `requireLiveRunForCaller` (`services/agentRuns/callbacks.ts`): the token must be `agent-context`, the `runId` claim (`ctx.agentRunId`, surfaced by `api/trpc.ts`) must name a run whose agent's shadow user is the caller, and the run must be `RUNNING`. **No tool takes a run id as input.** Events are written by the app in these callbacks via `appendRunEvent` (`services/agentRuns/events.ts`) — never streamed from Mastra — and a `tool_call` bumps `toolCallCount`.
4. **Finish**: when the Mastra call returns, the dispatcher re-reads the run. `CANCELLED` → discard the late result. `WAITING_ON_OWNER` (set by `askOwner`) → record wall-clock, do not finish. Otherwise `SUCCEEDED` with `finishRun`'s summary, else the agent's text; on error, `FAILED`. The status write is guarded on `status IN (RUNNING, QUEUED)` so a cancel is never overwritten, and only a matched write runs the finish hook.
5. **Finish hook** (`services/agentRuns/finish.ts`, also called by cancel and the sweep): one `agent_run` Notification from the shadow user to the requester ∪ owner (deduped by `(dedupeKey, userId)`), a workspace activity event (`entityType: "agent_run"`, `completed` | `failed`), and — if the run actually ran — an Agent-run Time entry: `PROPOSED`, `source: "agent-run"`, `sourceRef: "agent-run:<runId>"`, owned by the owner, `createdByAgentId` = the Assistant's External agent (ADR-0061), idempotent on `@@unique([userId, sourceRef])`.
6. **Safety nets** (`/api/cron/agent-runs` every minute → `services/agentRuns/sweep.ts`): `RUNNING` rows with no heartbeat for 5 minutes become `TIMED_OUT` (guarded on status); `QUEUED` rows older than 60 s are dispatched in case the kick was lost.
7. **Cancel** (`agentRun.cancel`, anyone with edit access on the action): `QUEUED → CANCELLED` outright; `RUNNING → CANCELLED` as a flag — callbacks refuse a non-`RUNNING` run and the dispatcher discards late results. The in-flight Mastra call is not aborted (accepted; `maxSteps: 12` on the agent bounds it).
8. **Unassign** cancels that agent's `QUEUED` run and lets a `RUNNING` one finish.

## Security invariants (do not loosen)

- A run acts **only** through an `agent-context` JWT minted by the dispatcher for the Assistant's shadow user; a web session, an `agent-key` principal or any token without the `runId` claim is `FORBIDDEN` at every callback (pinned in `routers/__tests__/mastraRunCallbacks.test.ts`).
- Delegation: `reassign-action` runs its containment check **as the owner** (`assertAssignableUsers(db, run.agent.ownerId, …)`) — the Assistant may assign exactly whom its owner could.
- The tool map is restricted **by construction** in the mastra repo (`assistantRunAgent`, `RUN_EXCLUDED_TOOL_KEYS`): no email send/reply, calendar create, Notion or CRM writes, OKR deletes, Slack, WhatsApp. The prompt's security policy is not what enforces this.
- Events are owner-only and selected server-side (`agentRun.listForAction` only queries events for runs whose agent the caller owns); a viewer's response never carries them.
- Assistant mutations (`assistant.create/update/delete/setDefault`) are `humanOnlyProcedure`: an agent cannot mint a principal.
- The dispatch and cron routes are fail-closed on `CRON_SECRET`.

## UI

- `actions/AgentRunPill.tsx` above the Activity section of `ActionDetailContent`: "Aria · Working 1m · called 3 tools" (polls `agentRun.listForAction` every 2 s while live, plus a bounded catch-up poll when the action already reports a live run), "Worked for … · called N tools" / "Stopped after …" / "Waiting on owner" after; Cancel while live; the summary (or error) on hover; `AgentRunTranscript` (owner only, collapsible, tool → verb label map).
- `PriorityCheckbox.isRunning` renders a spinning ring in place of the priority dot in every list row (`ActionRow` passes `agentRuns.length > 0`); the detail page swaps the status badge for a loader and "<Assistant> is working".
- Inbox **Delegated** tab (`inbox/DelegatedTab.tsx`, `services/inbox/delegated.ts`): runs the viewer requested or their own Assistant performed, grouped Working / Waiting on you / Finished / Reviewed this week, one WHERE builder per group shared by count and rows. Finished rows carry **Mark done** (completes the action as the human via `applyActionUpdate`, then stamps `reviewedAt`) and **Dismiss** (stamps only). The sidebar badge adds `attention = waiting + unreviewed` and never live runs (`useInboxCounts`). **Waiting on me** gains a fifth kind, assistant questions (`assistantQuestionsWaitingOnMeWhere`: my Assistant's latest run is `WAITING_ON_OWNER` and has no successor). `agent_run` notifications appear under Notifications and the channel matrix.

## Operations

- Env: `MASTRA_API_URL`, `CRON_SECRET` (required for both routes), the usual `AUTH_SECRET` for the JWT. Vercel cron: `/api/cron/agent-runs` `* * * * *` (`vercel.json`).
- Mastra side: `assistantRunAgent` must be deployed (mastra PR #73). Its `maxSteps: 12` is what keeps a run inside the 300 s function.
- Migrations: `20261009200000_assistant_external_agent_principal` (Assistant → External agent, with backfill), `20261010090000_agent_runs`, `20261010100000_agent_run_live_unique`.

## Testing

- Unit (mocked Prisma): `services/agentRuns/__tests__/*` (enqueue/coalescing/resume, dispatch claim + JWT + finish, events seq, sweep, finish hook, include), `routers/__tests__/mastraRunCallbacks.test.ts`, `agentRunCancel.test.ts`, `notifications/emit/__tests__/agentRunNotification.test.ts`.
- E2E: `e2e/agent-run.spec.ts` runs a Mastra **stub** on port 4199 (the Playwright dev server is started with `MASTRA_API_URL` pointing at it and `CRON_SECRET=e2e-cron-secret`, see `playwright.config.ts`), assigns the fixture Assistant, kicks the dispatcher, and asserts the ring, the pill flip, the stub's `reportProgress` callback and the transcript. `e2e/assign-to-assistant.spec.ts` covers the picker.
- Not covered automatically: a run against a real Mastra.

## Extending

- **A new run tool** = a tool in the mastra repo's `run-tools.ts` (allow-listed on `assistantRunAgent`) + a `mastra.<name>` procedure here that starts with `requireLiveRunForCaller` and ends with `appendRunEvent`. Add its id to `TOOL_LABELS` in `AgentRunTranscript.tsx`.
- **A new executor** = a value on `AgentExecutor`, a claim path (V2's `agentRun.claim/heartbeat/appendEvents/finish` for `LOCAL_CLI`), and nothing in the UI — the pill and Delegated read the same rows.
