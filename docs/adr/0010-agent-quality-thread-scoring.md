# Agent quality is measured by judging Threads against Zoe's contract, with failures routed to three repos

## Status

Accepted — 2026-06-04. Amended 2026-06-11: decisions 7–9 (prompt versioning,
eval-set distillation, calibration gate) close the verify/attribute stages of
the loop. Originally drafted as ADR-0008; renumbered to 0010 on landing because
main had since taken 0008 (pipeline triage model) and 0009 (connected
accounts).

## Context

Every Zoe interaction is already logged to `AiInteractionHistory` (user message,
response, `agentId`, `responseTime`, `tokenUsage`, `hadError`, `toolsUsed`,
`conversationId`), and a human **Feedback** rating (1–5) can be attached per
turn. But human ratings are sparse, nothing assesses the unrated majority, and
there is no scalable signal for "is Zoe actually any good, and where is she
failing?" We want a self-improving loop: score interactions, find the failures,
and route each to a fix.

Three forces shaped the design:

1. **"Conversation" is banned vocabulary** (CONTEXT.md — overloaded) and a turn
   in isolation is unjudgeable ("do it" means nothing without the prior turn).
2. **Zoe has a specific contract**, not generic chatbot goals: the brain must
   call a tool for any fact or action and never fabricate; the router persona
   forbids deflection ("never tell the user to check their own list"); and
   referential phrases must resolve against the **voice memory thread**.
3. **The fixes do not all live in this repo.** Zoe-the-brain's prompt and tools
   live in `../mastra`; the router persona + voice tool catalog are server-issued
   from this repo (ADR-0005); the tRPC endpoints her tools call live here; and
   some "failures" are not bugs at all but missing product capability.

## Decision

1. **The scored unit is a Thread** — one `conversationId`-scoped exchange with
   Zoe-the-brain, spanning one or more turns, judged as a whole. Keyed by the
   `conversationId` string (there is no `Thread`/`Conversation` table). Scope is
   limited to Threads where the **brain actually reasoned** (typed web, web-voice
   **brain passthrough**, Slack/API, WhatsApp). **Coarse-tool** turns are
   excluded — deterministic, no LLM, so their correctness is a unit-test concern.
   iOS is deferred until it issues a per-exchange `conversationId` (today it is a
   perpetual `voice-${userId}` thread, ADR-0006).

2. **The rubric is Zoe's contract, not generic NLP axes.** Four axes:
   **Resolved** (did the user get what they came for), **Grounded** (called tools
   vs. fabricated — a hallucination is a grounding failure), **Tool success**
   (the tools she invoked returned vs. errored — the "405" class), **No
   deflection** (avoided "go check your own list"). **Latency is a computed
   metric** (`responseTime`), never a judged axis.

3. **The judge measures apparent quality; the human rating is ground truth.** The
   judge sees only the transcript, so it cannot know whether the Action Zoe
   created was the *right* one. Human **Feedback** ratings exist to **calibrate**
   the judge, not be replaced by it. The three quality numbers stay distinct:
   **Thread score** (judge, apparent), `Feedback.rating` (human, ground truth),
   `AiInteractionHistory.confidenceScore` (Zoe's self-report).

4. **Failures route to one of three lanes, by owner-of-the-fix.**
   - `code_bug` → a tool errored/is missing → tRPC fix in **this repo**.
   - `agent_behaviour` → fabrication/deflection/mis-resolution → prompt/tool
     change, split between the router persona + voice catalog (this repo) and
     Zoe-the-brain's instructions in **`../mastra`**.
   - `capability_gap` → no tool covers the ask → a product **Ticket**/**Feature**,
     not a bug.
   The improvement loop routes each bad Thread to its lane rather than pointing
   one agent at one repo.

5. **Score results land in a `ThreadScore` table** (keyed by `conversationId`, at
   a different grain from per-turn `Feedback`), written by a trigger-agnostic
   `AgentEvalService`, judged by **Haiku 4.5**.

6. **A manual `score-threads` script is the first trigger, not a cron.** A plain
   Node script has no Vercel function time limit, so it can drain the whole
   backlog in one idempotent pass and doubles as the Phase-3 Level-A report
   (ranked failures grouped by lane). The nightly `CRON_SECRET` cron is a later
   ~20-line wrapper around the same service, not a prerequisite. Either trigger
   judges only **settled Threads** (no turn in the last hour), so unfinished
   Threads are not graded "unresolved."

7. **Every interaction is stamped with a `promptVersion`.** Without knowing
   which router-persona/brain-prompt combination produced a response, a score
   movement cannot be attributed to a change, and "did Tuesday's prompt change
   help?" is unanswerable. The stamp lands on `AiInteractionHistory` at write
   time and is the pivot for score-by-version trends (Phase 2) and the
   canary/rollback comparison across a deploy boundary.

8. **Failed Threads are distilled into a replayable eval set.** A scored-bad
   Thread becomes a frozen eval case (the user's messages plus the contract
   expectation it violated: "should have called tool X", "must not deflect").
   Candidate fixes — especially prompt patches — are scored against the eval
   set **offline** before any deploy. This is what makes the loop compound:
   iteration cycle time drops from "deploy + a week of live traffic" to
   "minutes against the eval set", and low live-traffic volume stops being the
   bottleneck. Every new failure grows the set, so verification strengthens
   with each pass.

9. **Judge calibration is a gate, not a vibe.** Wherever a Thread has both a
   `ThreadScore` and a human `Feedback.rating`, agreement is tracked;
   Level B/C autonomy (auto-filing issues, auto-proposing prompt patches) is
   enabled only after the judge clears a directional-agreement threshold on
   the overlap set. The judge prompt is itself versioned, and a random sample
   of judgements is periodically human-audited — an uncalibrated judge driving
   automated prompt changes optimises for the wrong thing, confidently. Human
   ratings are sparse and selection-biased (people rate when angry or
   delighted), so calibration weights for that rather than treating stars as
   unbiased truth.

## Considered alternatives

- **Score per turn.** Rejected: a turn is unjudgeable out of context, and "did
  Zoe resolve the ask" is only meaningful across a Thread. Turn-level facts
  (tool error, latency) become *inputs* to the Thread judgement instead.
- **Generic rubric (relevance/correctness/helpfulness).** Rejected: misses Zoe's
  actual failure modes (fabricating instead of tool-calling, deflecting),
  precisely the things her contract forbids.
- **Let the judge replace human ratings.** Rejected: the judge can only see the
  transcript and cannot verify real-world correctness; ratings stay the ground
  truth that calibrates it.
- **Constrain the improvement loop to this repo.** Rejected: the most common
  quality failures are prompt/grounding issues living in `../mastra`; a one-repo
  loop would be blind to them.
- **Nightly cron with no queue, per-run cap, multi-night backlog drain.**
  Rejected as the *starting* point: a manual script sidesteps the function-time
  limit entirely and fits the Level-A "human-in-the-loop" posture. The cron
  remains the eventual hands-off trigger, wrapping the same service.

## Consequences

- A new `ThreadScore` model + migration; `AgentEvalService`; a `score-threads`
  script. The judge runs in **this repo** (it owns the data; Mastra is a
  stateless execution engine).
- The script writes `ThreadScore` to **production** (where Threads live) and has
  no test-DB seatbelt — it must be idempotent (skip already-scored settled
  Threads) and deliberate about `DATABASE_URL`.
- Coarse-tool and iOS quality remain **unmeasured** by this judge — an explicit,
  logged gap, not a silent one.
- Failure-lane routing presumes a future agent (Level B/C) that can open issues
  in three places (beads/tRPC here, a `../mastra` issue, an Exponential Ticket).
  Until then, Level A surfaces the lanes in a report for a human to action.
- `promptVersion` stamping must ship **before** the first prompt fix, or the
  baseline is lost.
- The `agent_behaviour` lane — not `code_bug` — is the automation target for
  Level C: cluster failed Threads by failure mode (reuse the existing
  `EmbeddingService` feature-request clustering), have a strong model propose a
  prompt patch per cluster, score it against the eval set, and open a PR only
  if eval score improves without regressions. `code_bug` PR drafting remains a
  narrow mechanical lane.
- The eval set and calibration overlap need volume; until they have it, the
  loop runs at Level A (human-actioned report) regardless of how good the
  tooling is.
