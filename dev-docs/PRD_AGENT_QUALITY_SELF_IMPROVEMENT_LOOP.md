# PRD: Agent quality self-improvement loop

*A closed loop that measures every Zoe conversation, routes each failure to whoever owns the fix, and verifies fixes offline before they ship — so response quality compounds instead of drifting.*

> **Canonical copy lives in Exponential** (workspace `syntrofi` / product `exponential`) — comment there for the team discussion:
> - PRD page: https://www.exponential.im/w/syntrofi/pages/cmruptufm0009jp04e5jv1tsf
> - Feature (scopes + requirement rows): https://www.exponential.im/w/syntrofi/products/exponential/features/cmq9u39kr0001ky04encxm1t8
>
> This in-repo copy is a convenience mirror for reviewers reading the code. If the two drift, the Exponential feature (with its checkable requirement rows) wins.

**Decisions:** [ADR-0012 — Agent quality Thread scoring](../docs/adr/0012-agent-quality-thread-scoring.md) · [ADR-0013 — Eval replay frozen-prefix](../docs/adr/0013-eval-replay-frozen-prefix.md)
**Operator guide:** [AGENT_QUALITY_RUNBOOK.md](./AGENT_QUALITY_RUNBOOK.md) · **Glossary:** [CONTEXT.md](../CONTEXT.md) → *Agent quality*

---

## Problem

**Zoe's quality is invisible, and improving it is entirely manual.**

- **We only hear about the failures users bother to report.** Human thumbs-ratings are sparse and selection-biased. Nothing at all assesses the silent majority of conversations — where Zoe fabricated a fact, deflected ("check your list…"), or hit a broken tool and the user just quietly gave up.
- **We can't verify a fix without shipping it.** Today the only way to know whether a prompt change helped is to deploy it and watch live traffic for a week. That makes every prompt edit a slow, risky guess.
- **Nobody owns the fix by default.** A bad answer might be a server bug (this repo), a prompt defect (split across this repo's router persona *and* Zoe-the-brain in `../mastra`), or a genuinely missing product capability. Without triage, every failure looks the same and lands nowhere.

The net effect: quality drifts silently, regressions reappear, and the same failure modes recur because nothing turns a past failure into a permanent guard.

## Goals

- **Measure quality on every settled conversation**, not just the rated ones — a score against Zoe's contract for each Thread.
- **Route every failure to the owner of the fix** automatically (three lanes: `code_bug`, `agent_behaviour`, `capability_gap`).
- **Verify a candidate prompt offline in minutes**, against the accumulated set of past failures, with zero production side-effects — no more week-long live-traffic waits.
- **Make every failure a permanent regression test** — the eval suite only grows, so a fixed problem stays fixed.
- **Attribute score movements to specific prompt changes**, so we can prove (or disprove) that a deploy helped.
- **Keep the judge honest** — no autonomous action unlocks until the judge agrees with human ratings above a threshold.

**Success looks like:** each week, a ranked report of Zoe's worst conversations grouped by owner; `agent_behaviour` fixes shipped as PRs carrying eval evidence (pass-rate diff, zero regressions); and live score-by-prompt-version trends confirming the change landed.

## Non-goals

- **Auto-merging prompt patches.** A human always merges. The loop deliberately ends at "PR opened with eval evidence."
- **Generic NLP quality metrics** (relevance/helpfulness scores). The rubric is *Zoe's contract only* — Resolved / Grounded / Tool success / No deflection.
- **Judging created entities beyond the transcript.** Human ratings remain ground truth for "did the thing Zoe made actually make sense."
- **Scoring coarse-tool turns and iOS voice Threads** — deferred until iOS issues per-exchange Thread ids (ADR-0012).
- **A nightly cron as the deliverable.** The manual trigger is the product; scheduling is a thin wrapper added later.

## Solution

Five moving parts, staged so value arrives at part one:

1. **Judge** — an LLM judge (Haiku 4.5) scores every *settled* Thread (no turn in the last hour) against Zoe's four-axis contract, writing a `ThreadScore`. Runs via `npm run score-threads`, idempotent, refuses to touch a non-local DB without an explicit flag.
2. **Route** — each failing Thread is classified into one **Failure lane** by owner-of-the-fix: `code_bug` (tRPC/tool fix here), `agent_behaviour` (prompt fix, this repo's persona + `../mastra`'s brain), or `capability_gap` (a product Ticket, not a bug). A ranked **Level-A report** surfaces the worst first.
3. **Distil** — every failure is frozen into an **EvalCase**: the conversation prefix up to the violating turn plus the contract expectation it broke. The suite is a growing regression harness.
4. **Verify** — **Eval replay** (`npm run eval-prompt`) runs a candidate prompt (whatever branch `../mastra` has checked out) against the EvalCase suite in-process. It regenerates *only* the violating turn, judges it with the same versioned judge, and prints a pass-rate diff vs baseline. **Tools never execute** — calls are captured as intent, so a candidate Zoe can't mutate production.
5. **Attribute** — every interaction is stamped `promptVersion = router@<hash>+brain@<hash>`. After a deploy, the admin **Thread-score trends by prompt version** confirm or refute that the change helped on live traffic.

A **calibration gate** tracks judge-vs-human directional agreement; only once it clears a threshold do the autonomous stages (auto-filing, AI-proposed patches) unlock. Humans always merge.

**Why this way** — the design choices worth defending (full rationale in the ADRs):

- **Judge whole Threads, not single turns** — resolution is a property of the conversation, not one message. Settled-only avoids grading unfinished work as "unresolved."
- **Frozen-prefix, single-call replay** — deterministic, fast, side-effect-free. We reject full multi-turn replay with mocked tool results as brittle and slow (ADR-0013).
- **Candidate = a real git branch of the brain repo** — evals test the exact artifact that deploys, not a stand-in.
- **Two repos, one loop** — the brain (`../mastra`) stays a stateless execution engine; all scores, cases, and calibration data live in this app's database, stamped truthfully at the deploy boundary.
- **Staged autonomy behind calibration** — the eval set only protects against *previously seen* failures, so live version-stamped scores are the real backstop and a human is always in the merge path.

## Requirements

Canonical, checkable copies of these live as requirement rows on the [feature](https://www.exponential.im/w/syntrofi/products/exponential/features/cmq9u39kr0001ky04encxm1t8).

**Measure & route (V1 — live)**

- When a scoring run executes, judge every settled Thread (no turn in the last hour) that has no existing `ThreadScore`.
- Score each Thread against Zoe's four-axis contract: Resolved, Grounded, Tool success, No deflection.
- Classify each failing Thread into exactly one Failure lane: `code_bug`, `agent_behaviour`, or `capability_gap`.
- When a Thread scores below passing, create one frozen EvalCase capturing the conversation prefix up to the violating turn and the violated expectation.
- Stamp every Zoe interaction with a composite Prompt version (router hash + brain hash).
- The scoring run is idempotent — a Thread that already has a `ThreadScore` is not re-judged.
- If the scoring run targets a non-local database, refuse to proceed unless an explicit confirmation flag is supplied.

**Verify & calibrate (V2 — in QA)**

- When an eval replay runs, regenerate only the violating turn's response from the candidate prompt and judge it against the stored expectation with the same versioned judge as live scoring.
- While an eval replay runs, never execute real tools; capture tool invocations as intent only.
- Instantiate the candidate prompt from the branch checked out in the `../mastra` working tree.
- When a candidate is compared to a baseline, emit a pass-rate diff, per-case verdicts, and a regression list, and exit non-zero if any regression exists.
- The admin dashboard presents Thread-score trends by agent, Failure lane, and Prompt version, with worst-Thread drilldown.
- Track judge-vs-human directional agreement over the overlap set and gate autonomy on a configured threshold.

**Autonomy (V3 — planned)**

- While calibration is above threshold, auto-file confirmed failures to the tracker that owns each lane.
- Cluster failures by failure mode so a single prompt patch can address a class of failures.
- When AI proposes a prompt patch, open it as a PR only if evals improve with no regressions, and a human always merges.

## Rollout

**V1 — Measure & route (Level A) — SHIPPED / live.** Judge, `ThreadScore`/`EvalCase`, `promptVersion` stamping, `score-threads` CLI, ranked Level-A report. A human actions the report. (PR #175, merged 2026-06-11; follow-ups #183, #360.)

**V2 — Verify & calibrate — IN QA.** Eval-replay runner, `eval-prompt` orchestrator (pass-rate diff), Thread-score analytics dashboard, calibration gate, and Level B lane-routed auto-filing. Built; being verified.

**V3 — Autonomy (Level C) — PLANNED.** Failure clustering + eval-gated prompt-patch PRs, nightly `score-threads` cron, scheduled `file-failures` behind the gate, `eval-prompt`-as-CI evidence on `../mastra` PRs, periodic judge audit.

## Where we are

We are at **Level A, operating manually** — the loop's first rung and already delivering value. Phase 1 is live: `score-threads` judges the backlog against prod and prints the ranked report, and every failure is being distilled into the EvalCase suite. Phase 2's machinery (offline `eval-prompt` verification, the analytics dashboard, and the calibration gate) is built and sitting in QA. Nothing autonomous is switched on yet — that's gated on the calibration card reaching its agreement threshold, which in turn depends on us **rating responses as we use Zoe** to build ground truth.

## Open questions

- **What's the calibration threshold, exactly, and who owns declaring it met?** ADR-0012 sets ≥80% directional agreement over ≥10 overlap pairs as the gate; confirm the team is comfortable unlocking Level B/C at that bar. *(Owner: product)*
- **How much do we invest in growing human ratings** to reach calibration faster, vs. letting it accumulate passively? Nothing autonomous unlocks without it. *(Owner: product)*
- **Weekly cadence owner** — who runs the weekly `score-threads` + triage until the nightly cron lands? *(Owner: eng)*
- **Judge-drift policy** — when we revise the judge prompt (bumping `JUDGE_VERSION`), how do we keep old vs new scores comparable in the dashboard? *(Owner: eng)*
