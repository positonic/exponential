# Eval replay is a frozen-prefix run of the ../mastra working tree, judged in exponential

## Status

Accepted — 2026-06-11. Extends ADR-0012 (agent-quality Thread scoring): that ADR
decided failed Threads are distilled into a replayable eval set; this one
decides what a replay *is*.

## Context

ADR-0012 decision 8 promises that a candidate prompt patch can be "scored
against the eval set offline, in minutes." That promise hides three unresolved
problems:

1. **A Thread replay is not deterministic.** The user's turn 3 was a reaction
   to Zoe's *original* turn 2 — under a candidate prompt Zoe's turn 2 differs
   and the recorded turn 3 stops making sense. And Zoe's turns invoked real
   tools: a naive replay would have a candidate Zoe creating Actions against
   production data during an eval run.
2. **The prompt being patched lives in another repo.** The `agent_behaviour`
   lane mostly targets Zoe-the-brain's instructions in `../mastra`, but the
   eval data, judge, and report live in exponential (ADR-0012: it owns the
   data).
3. **`promptVersion` as first shipped covers only this repo.** The stamp hashes
   the router persona + voice catalog; a brain prompt change in `../mastra`
   would not change it — breaking live-score attribution for exactly the lane
   the loop automates.

## Decision

1. **Replay is frozen-prefix, single-call, tools never execute.** An `EvalCase`
   stores the conversation prefix up to the violating turn (a
   `violatingTurnIndex` into the stored transcript) plus the violated contract
   expectation. A replay feeds that frozen prefix to the candidate brain and
   judges **only the next response** against the expectation. Tool calls are
   captured as **intent** ("did she try to call `createAction`?") and judged;
   they are never executed. Deterministic, side-effect-free, one model call
   per case.

2. **The engine is Mastra's native `runEvals`, in-process, in the `../mastra`
   working tree.** A runner script in `../mastra` instantiates the assistant
   agent from the **local checkout** — the candidate prompt is simply a git
   branch, so evals test the exact artifact that deploys. Tools are replaced
   with intent-capturing no-op executors (same schemas). Exponential's
   `eval-prompt` harness exports EvalCases, invokes the runner as a
   subprocess, and judges the results with **our contract judge** (wrapped as
   a custom Mastra scorer; ADR-0012's rejection of generic NLP metrics
   stands). No Mastra server runs anywhere in this path — and scoring live
   Threads (`score-threads`) never touches Mastra at all.

3. **Brain prompt attribution travels in response metadata.** `../mastra`
   computes `brain@<sha256(instructions)[:12]>` at module load and includes it
   in every agent response; exponential composes the stamp
   `promptVersion = router@<X>+brain@<Y>` at interaction-write time. Each repo
   deploys independently and the stamp stays truthful at the deploy boundary —
   where canary comparison happens.

4. **A human always merges.** Level C ends at "PR opened with eval evidence"
   (pass-rate diff vs baseline, per-case results, regression list). The eval
   set only protects against *previously seen* failure modes; a patch can pass
   every stored case while introducing a novel regression. Live Thread scores
   by `promptVersion` are the post-merge backstop, not a license to
   auto-merge.

5. **The eval set is a growing regression suite.** Cases accumulate (passing
   cases keep guarding); an `active` flag retires a case manually when the
   product changes underneath it (e.g. a `capability_gap` ships and the old
   expectation inverts).

## Considered alternatives

- **Tool-mocked multi-turn replay.** Rejected: requires capturing tool
  *results* (not stored today), and user turns still diverge after the first
  changed response — fidelity it pays for but cannot deliver.
- **Live-tools replay in a sandbox workspace.** Rejected: per-case fixture
  authoring, slow, flaky, and any isolation failure means a candidate Zoe
  writes to production.
- **HTTP `/eval/replay` endpoint with `instructionsOverride`.** Rejected:
  requires a running, auth-guarded server, and tests an override grafted onto
  whatever code that server runs — not the candidate branch as it would
  deploy.
- **Anthropic-replica harness inside exponential.** Rejected: the replica
  drifts from the real brain (model params, memory wrapper, middleware);
  evals could pass while the deployed brain still fails.
- **Adopting Mastra scorers/datasets wholesale as the system of record.**
  Rejected: forks the quality data — `ThreadScore`/`EvalCase`/calibration live
  in exponential's Postgres per ADR-0012. `runEvals` is used as an *engine*,
  not as the store.
- **Auto-merge after calibration + soak.** Rejected for now: users become the
  canary for unseen failure modes; loosening later is cheap, re-tightening
  after an incident is not.

## Consequences

- `EvalCase` needs a `violatingTurnIndex` (amendment to PR #175, unmerged).
- The interaction logger composes the two-part `promptVersion` when the brain
  reports its hash, and falls back to `router@<X>` alone when it doesn't —
  old Mastra deploys stay compatible.
- `../mastra` grows: the `brain@` hash in response metadata, the `runEvals`
  runner script, and no-op intent-capturing tool executors.
- Whether Mastra's scorer API exposes tool calls to custom scorers is
  unverified; if it doesn't, the runner captures intents via step callbacks
  instead — an implementation detail, not a design risk.
