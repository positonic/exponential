# Agent Quality — Operator's Runbook

How to actually run the self-improvement loop, day to day. Architecture and
rationale live in [ADR-0012](../docs/adr/0012-agent-quality-thread-scoring.md)
and [ADR-0013](../docs/adr/0013-eval-replay-frozen-prefix.md); glossary terms
(Thread, Thread score, Failure lane, EvalCase, Eval replay, Prompt version)
in [CONTEXT.md](../CONTEXT.md#agent-quality). This file is just *what to do
and when*.

> Status as of 2026-06-12. The measuring/verifying machinery is live; the
> automation is deliberately not running yet — partly unbuilt (tickets
> below), partly locked behind the calibration gate.

## What is live right now

| Thing | State | You interact via |
|---|---|---|
| Every Zoe conversation logged, incl. tool calls (post PR #184) | automatic | nothing |
| Prompt-version stamp (`router@X+brain@Y`) on every response | automatic (brain half requires the mastra deploy carrying `x-brain-version`) | nothing |
| The judge + scoring | works, **manual trigger** | `npm run score-threads -- --yes` |
| The evals (**EvalCase rows in prod Postgres**) | created automatically whenever scoring finds a failure: frozen transcript + violated expectation + `active` flag | consumed by `eval-prompt`; retire stale cases by setting `active = false` |
| Dashboard | live at `/admin/feedback` → "Thread Scores" section (trend, lanes, prompt versions, worst Threads, calibration card) | browser |
| Weekly Slack digest to admins | automatic, Mondays 09:00 UTC (manual: `admin.sendThreadScoreDigest`) | arrives by itself |
| Verify-a-prompt-fix | works, manual | `npm run eval-prompt` (below) |
| Auto-filing of failures | built but **gate-locked** until the judge is calibrated | `npm run file-failures` (no-ops with a clear log while the gate is closed) |
| Nightly auto-scoring / CI evals / scheduled filing / AI-proposed patches | **not built** — tickets `stormy.mesa`, `sunny.cosmos`, `plum.breeze`, `macro.titan` | future |

## The operator routine

### Daily — no commands

Use Zoe normally. **Rate responses** (thumbs) when they're notably good or
bad. Ratings are the calibration fuel: nothing autonomous unlocks without
them (ADR-0012 decision 9).

### Weekly — one command

```bash
DATABASE_URL=<prod> npm run score-threads -- --yes
```

Judges every settled, unscored Thread (idempotent — safe to re-run; one
Haiku call per Thread), grows the EvalCase suite from failures, refreshes
the dashboard, prints the ranked Level-A failure report. `--limit 25` to
drain in smaller bites. Ticket `stormy.mesa` turns this into a nightly cron.

### When the report shows a failure to fix

- **`code_bug` lane** → a tool/tRPC endpoint here errored. Fix like any bug.
- **`capability_gap` lane** → not a bug; a missing product capability. File
  a product Ticket.
- **`agent_behaviour` lane** → prompt problem (usually Zoe-the-brain's
  instructions in `../mastra`). Edit the prompt, then **prove it against
  every past failure before deploying**:

```bash
# 1. Baseline: how the CURRENT production prompt scores
cd ../mastra && git checkout main
cd ../exponential && npm run eval-prompt -- --save baseline.json

# 2. Candidate: your edit on a branch
cd ../mastra && git checkout -b my-prompt-fix   # edit instructions
cd ../exponential && npm run eval-prompt -- --baseline baseline.json
```

Output: `candidate passes N/M vs baseline K/M; regressions: [...]` plus a
per-case verdict table — markdown, paste it into the PR body. Exit code 2
on regressions. Useful flags: `--lane agent_behaviour`, `--since <date>`,
`--cases <file>` (skip the DB export).

After the fix deploys, the **Score by Prompt version** table on the
dashboard confirms (or refutes) that it helped on live traffic — the brain
hash changes with the prompt, so the comparison is automatic.

## What unlocks later, without code changes

The **calibration card** on `/admin/feedback` tracks judge-vs-human
directional agreement. At ≥80% over ≥10 overlap pairs the gate opens, and:

- `npm run file-failures` starts actually filing (code_bug → beads here,
  agent_behaviour → beads in `../mastra` or here, capability_gap → product
  Ticket; clustered, idempotent via `ThreadScore.filedAt`).
- `macro.titan` (once built) adds the Level C inner loop: failures
  clustered by mode → Opus proposes a minimal prompt diff → eval-gated →
  PR opened with the evidence block, **manually triggered** by the
  operator. A human always merges (ADR-0013 decision 4).

## Gotchas / history

- **Threads from before 2026-06-12 are unjudgeable on the Grounded axis**:
  `toolsUsed` wasn't logged until PR #184, so the judge saw "no tools" on
  every old turn. Their ThreadScores were left in place as tombstones (so
  the idempotent scorer doesn't re-mis-judge them) — read pre-fix dashboard
  numbers as pessimistic noise. EvalCases distilled from them remain valid
  replay tests; retire any nonsense ones via `active = false`.
- The judge prompt is versioned (`JUDGE_VERSION`); bumping it resets the
  calibration evidence by design.
- `score-threads` and `file-failures` refuse non-local DB hosts without
  `--yes` and never modify `AiInteractionHistory` — they only insert
  `ThreadScore`/`EvalCase` (and set `filedAt`/`filedRef`).
- Migrations ride the pipeline: merge to develop → staging DB; promote
  develop → main → production DB. Never hand-run them.
