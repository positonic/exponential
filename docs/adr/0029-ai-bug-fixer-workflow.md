# ADR-0029: Autonomous AI bug-fixer via GitHub Actions

Status: Accepted

## Context

We want a worker that, when a bug in Exponential is explicitly marked safe for an
AI to attempt, picks it up, writes a fix, validates it, and opens a PR — with the
originating ticket kept in sync and **human review mandatory**.

Discovery found that almost all the moving parts already exist:

- Bugs are `Ticket` rows with `type = BUG` in the product plugin
  (`src/plugins/product/`). `Ticket` already carries `status`, `priority`,
  `branchName`, `prUrl`, tags, and comments.
- `READY_TO_PLAN` already means "fully specified, ready for an AFK agent" — see
  [docs/agents/triage-labels.md](../agents/triage-labels.md).
- The `ticket` tRPC router (`list` / `getById` / `update` / `addComment`) exposes
  the full read/write surface, all callable with a Bearer JWT (the CLI auth path
  in `src/server/api/trpc.ts`).
- The `exponential` CLI already wraps those (`tickets list/get/update`,
  `tickets comment add`, label filters), and the `setup-merge-hook` skill already
  establishes the blessed CI→Exponential pattern: `npm i -g exponential-cli` +
  `exponential auth login --token $EXPONENTIAL_TOKEN`.
- PR-merge → ticket close-out is already automated: [ADR-0021](0021-pr-merge-promotes-ticket-via-app-webhook.md)
  promotes a ticket from `QA` to `DONE` when its linked PR merges.
- The CLI's own roadmap already names this worker shape ("ACFS": a polling loop
  that dispatches issues to AI agents).

So the goal is **not to invent a system** — it is to add the thin orchestration
layer that connects these existing pieces.

## Decision

Add one scheduled **GitHub Actions** workflow (`.github/workflows/ai-bug-fixer.yml`)
plus two small helper scripts (`scripts/ai-bug-fixer/`). **No app code, no schema
changes, no new tRPC procedures.**

- **Marker:** a human opts a bug in by adding the **`ai-fixable`** label to a
  `type = BUG` ticket in `READY_TO_PLAN`. Exclusions are enforced in the worker:
  any ticket also tagged `security`, or with `priority = 0` (critical), is never
  attempted. Reuses the existing tag system — no new field.
- **Trigger:** the workflow polls hourly (`schedule`) plus `workflow_dispatch`.
  Polling is used because **no outbound event path from Exponential exists today**;
  a `repository_dispatch` upgrade is left as future work.
- **Orchestration is GitHub Actions** because the fix needs a repo checkout, a
  coding agent, and a PR — all native to Actions, and the repo already
  standardises on Actions. No new queue/worker infrastructure.
- **Coding agent:** `anthropics/claude-code-action`, authenticated with a Claude
  subscription token (`CLAUDE_CODE_OAUTH_TOKEN`, a flat fee) and defaulting to a
  cheap model (`claude-haiku-4-5`). Model and auth are configurable via repo vars.
- **Worker interface is the `exponential` CLI + a bot JWT** (`EXPONENTIAL_TOKEN`),
  mirroring `setup-merge-hook`. Zero new API surface.
- **Soft lock:** a single-runner `concurrency` group plus a `READY_TO_PLAN →
  IN_PROGRESS` status flip on claim. Good enough for one serial runner.
- **Human review is structural:** the workflow only ever *opens* a PR (never
  `--merge`, never deploys). Close-out stays with the ADR-0021 merge webhook.

### Flow

```
hourly / manual → scan (CLI only): pick oldest eligible bug, minus security/critical, under PR cap
  → fix: claim (IN_PROGRESS + ai-in-progress) → render brief → claude-code-action
        → validate (tsc + next lint) → open PR (QA, link prUrl/branch) | release back to READY_TO_PLAN
  → human reviews & merges → ADR-0021 webhook flips QA → DONE
```

## Consequences

- **Cost is bounded** by: opt-in `ai-fixable` tag, one ticket per run, a cap on
  open AI PRs, an hourly cadence, a cheap default model, and a subscription token.
- **The claim is not atomic.** Two parallel workers could in principle race; the
  single-runner `concurrency` group prevents that today. True parallelism would
  need a conditional-claim mutation — deliberately deferred.
- **Polling latency** is up to the cron interval. Acceptable; upgradeable to
  `repository_dispatch` without changing the rest of the design.
- **PRs opened by the default `GITHUB_TOKEN` do not trigger CI.** To run the test
  suite on AI PRs, set an `AI_BUG_FIXER_GH_TOKEN` PAT (the workflow prefers it).
- If validation fails, the agent makes no change, or the agent flags the bug as
  needing a human, the ticket is **released back to `READY_TO_PLAN`** with an
  explanatory comment — never left silently stuck in `IN_PROGRESS`.

See [docs/agents/ai-bug-fixer.md](../agents/ai-bug-fixer.md) for setup and operations.
