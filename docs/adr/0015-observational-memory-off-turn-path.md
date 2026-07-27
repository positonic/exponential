# Observational memory runs off the interactive turn path (async consolidation, lagged by one turn)

## Status

Accepted — 2026-06-13

## Context

A user reported Zoe taking ~2 minutes to insert a single **Action** in the Personal workspace, with no satisfying acknowledgement. AI-tracing spans (newly live — [ADR-0013] tooling) from the exact run broke the 188s turn down:

- `model_step 0`: 94.6s — of which **86.0s** was the observational-memory *input step processor*.
- `tool_call quickCreateActionTool`: **1.5s** (the actual work).
- `model_step 1`: 90.3s — of which **86.1s** was the observational-memory input step processor again.

So **172 of 188s (91%)** was observational-memory consolidation running **synchronously before each model step**. The LLM passes (~8s, ~4s) and the insert itself (1.5s) were fast. This directly contradicted the documented **Round-trip** latency model in `CONTEXT.md`, which attributed slow turns to Sonnet pass time and never mentioned observational memory.

**Root cause (corrected — an earlier draft of this ADR was wrong).** It is **not** a dropped partial override: `@mastra/memory` merges observation/reflection config per-field, so nothing was lost. Async buffering is disabled because **`scope: 'resource'`** — Mastra's `validateBufferConfig` *throws* if buffer fields are set under resource scope, so resource-scope consolidation is **synchronous-only by design**. "Restoring the buffer config" under resource scope would crash the agent, not fix it. This behaviour is unchanged from `@mastra/memory@1.17.1` / `@mastra/core@1.28.0` (our installed versions) through the latest 1.42 — **upgrading is not a fix.** Mastra exposes a public `recall()` but **no public out-of-band `observe()`/`consolidate()`** — the in-band processor is the only supported entry point.

A second, scope-independent aggravator: the chat route (`src/app/api/chat/stream/route.ts`) sends the **full client message history** (trimmed to 20k tokens) to `agent.stream()` *and* passes `memory: { resource, thread }`. Mastra already holds the history in the thread store, so the explicit history re-inflates the unobserved-token count every turn and trips observation more often than it should. Mastra's docs warn against this explicitly.

## Decision

1. **Consolidation is allowed to lag.** Observations distilled from a turn need not be available within that same turn; they are ready for the next turn. (Recall of *existing* observations stays in-turn — it is a fast DB read.) This is the freshness-vs-latency trade-off, decided in favour of latency.
2. **Switch to `scope: 'thread'`** (the async path exists *only* under thread scope). This re-enables Mastra's default async buffering (`observation.bufferTokens: 0.2` / `bufferActivation: 0.8`, `reflection.bufferActivation: 0.5`). Do **not** hand-set buffer fields — let the defaults apply. Add `activateAfterIdle: '5m'` to align with the prompt-cache TTL. Result: consolidation fully off the turn path, turns reliably ~15s.

   The cost is **deliberate and time-boxed**: Zoe stops carrying observations across conversations (recall *within* a thread still works). Cross-conversation memory is **deferred to out-of-band work**, not abandoned — see Consequences. Resource scope was rejected as the interim because it has **no async path** by design (`validateBufferConfig` throws on buffer fields under resource scope); the best it could do is "usually fast, occasionally blocks for tens of seconds when the cross-thread backlog consolidates," which doesn't meet the reliability bar after a 2-minute incident. As a bonus, thread scope also contains blast radius — the 2026-06-12 web_fetch poison spread *because* it was resource-scoped.
3. **Stop double-feeding history** (independent of scope). Send only the new user message to `agent.stream()` and let Mastra's thread memory supply prior turns, instead of re-sending full client history alongside `memory: { resource, thread }`.
4. **Gated on a local verification run** proving an insert turn drops to ~15s (and spans show no synchronous observation processor on the path) before shipping. Mastra internals have surprised us repeatedly; not trusted blind.
5. **Immediate acknowledgement is deterministic and client-side**, not a fast-model call. The existing ephemeral `ThinkingStatus` slot renders a request-aware ack on submit (0ms, replaced when real prose streams). A model-generated ack was rejected: it adds a pass and can promise an outcome the brain then contradicts (acking "adding to Finances" when the Action lands in no project).

## Considered alternatives

- **Keep resource scope, accept synchronous consolidation as-is:** rejected — it is the entire 172s.
- **Shrink the *agent* context window (e.g. 8k):** rejected — does nothing for this latency. The per-pass cost is the cross-thread **unobserved backlog**, not the agent window; only the OM knobs (`messageTokens`, `previousObserverTokens`, `maxTokensPerBatch`, `maxOutputTokens`) bound it.
- **Own consolidation out-of-band (scheduled job):** rejected for now — no public Mastra API, so it means calling internals or reimplementing; most control but most code and most fragility.
- **Upgrade Mastra:** not a fix — resource-scope synchronous consolidation is unchanged from 1.17.1/1.28.0 through 1.42.
- **Fast-model router ack (mirroring the Voice router):** rejected — extra pass, extra failure surface, and the contradiction risk above. The voice router/brain split earns its keep on a latency-critical spoken channel; text chat does not need it once the turn is fast.

## Consequences

- A simple Action insert should drop from ~2min to ~15s; the win scales with step count (each step no longer drags ~86s).
- Observations reflect the conversation **as of the previous turn**, not the current message. Acceptable for a consolidation/memory feature; do **not** "fix" this by moving consolidation back in-band — that reintroduces the latency this ADR removes.
- **Cross-conversation memory is lost in the interim.** Zoe will recall within a conversation but not across them until the deferred out-of-band consolidation lands. Tracked separately; blocked today by the lack of a public Mastra consolidation API, so it is real new work (a scheduled job over a resource's threads), not a config flip.
- **Existing resource-scoped observations are orphaned, not deleted.** Rows already in `mastra_observational_memory` at resource scope simply stop being read once recall is thread-scoped. No data loss; reclaimable if/when the out-of-band path is built. No migration required to ship.
- The verification run (insert turn ≈ 15s, spans show no synchronous observation processor on the path) is the regression check against future Mastra changes.
- `CONTEXT.md`'s **Round-trip** entry carries a dated correction pointing here; its pass-time model is accurate again only once consolidation is off the path.
