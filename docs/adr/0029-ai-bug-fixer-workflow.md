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

- **Marker:** a human opts work in by adding a **trigger label** to a ticket in
  `READY_TO_PLAN` — **`ai-fixable`** for bugs, **`ai-buildable`** for features
  (see *Amendment*). Exclusions are enforced in the worker: any ticket also
  tagged `security`, or with `priority = 0` (critical), is never attempted.
  Reuses the existing tag system — no new field.
- **Trigger:** the workflow polls hourly (`schedule`) plus `workflow_dispatch`.
  Polling is used because **no outbound event path from Exponential exists today**;
  a `repository_dispatch` upgrade is left as future work.
- **Orchestration is GitHub Actions** because the fix needs a repo checkout, a
  coding agent, and a PR — all native to Actions, and the repo already
  standardises on Actions. No new queue/worker infrastructure.
- **Coding agent:** the Claude Code CLI, called directly (see *Amendment*;
  originally `anthropics/claude-code-action` with a Claude subscription token).
  Model, endpoint and spend ceiling are configurable via repo vars.
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

## Amendment (2026-07-30): OpenRouter, a second label, and a direct CLI call

Three changes. The shape of the decision above — Actions, CLI-as-interface, PR
for human review, no app code — is unchanged.

**1. The coding agent is the Claude Code CLI, called directly.** Not
`anthropics/claude-code-action`. The action authenticates via OIDC against
Anthropic and does not support a third-party endpoint, which the model change
below requires. It also rewrote `remote.origin.url` to embed its own bot token,
which the workflow had to undo before every push. Decisively: the action step is
`continue-on-error`, so its failures surfaced as a **green run that produced no
PR** — a total outage went unnoticed for five weeks. A direct call yields a plain
exit code, and the workflow turns a non-zero agent exit into a **red** run (only
an honest "couldn't do it" — bail, empty diff, failed validation — stays green).
The `id-token: write` permission and the remote-URL workaround are both gone.
The agent is allow-listed to `Read,Write,Edit,Glob,Grep` and **Bash is
explicitly denied** (`--disallowedTools`). The deny is what does the work: an
allow-list alone does not restrict, and the repo's checked-in
`.claude/settings.json` would otherwise merge its own `Bash(...)` allow rules
into the agent's permissions. With the deny in place, an agent holding an API
key in a public repo's runner cannot shell out.

**2. The model is served by OpenRouter, defaulting to `z-ai/glm-5.2`.** Both
profiles, not just features. OpenRouter's Anthropic-compatible endpoint
(`https://openrouter.ai/api` — note `/api`, not `/api/v1`) means "which
provider" collapses to a model string: OpenAI and Anthropic models are reachable
the same way. Set `AI_BUILDER_BASE_URL` to `https://api.anthropic.com` to talk to
Anthropic directly — clearing it merely restores the OpenRouter default, since an
Actions `||` expression cannot tell an unset variable from an empty one. The
workflow picks the auth header per endpoint: `x-api-key` (`ANTHROPIC_API_KEY`)
for Anthropic direct, `Authorization: Bearer` (`ANTHROPIC_AUTH_TOKEN`) for
everything else — still exactly one credential secret either way.

*Consequence, and it is a real one:* the flat-fee subscription token named as a
cost control above is gone. Billing is per-token. `--max-budget-usd` was added as
a per-run ceiling to compensate — with a caveat: the CLI prices spend from an
internal per-model table, and for a proxy-served model id it does not know the
computed cost can be $0.00, leaving `--max-turns` and a provider-side key spend
limit as the real bounds (see the *Cost controls* caveat in
[docs/agents/ai-bug-fixer.md](../agents/ai-bug-fixer.md)). Rejected: keeping the subscription for bugs
and OpenRouter for features — two auth paths and two failure modes to keep alive,
for a worker with almost no track record to protect.

**3. A second trigger label, `ai-buildable`, for features.** `--label` on the CLI
ANDs, so "either label" cannot be one query; the scan runs one list per label and
`select-candidate.mjs` merges them, recording which query matched. A ticket with
both is worked as `ai-fixable` — the narrow-fix profile. (Deliberate consequence:
the diff gate below is keyed to the `ai-buildable` trigger, so a both-labelled
ticket is not diff-gated; its schema edits reach human review like any bug
fix's.) `ai-buildable` adds one
gate: **schema and migration edits are rejected by diff**, not by prompt.
Rationale — preview deploys run `next build` only, never `prisma migrate deploy`,
so a schema change cannot reach a preview database and the feature would appear
broken for reasons unrelated to the agent.

**Deliberately still not done:** no per-workspace provider configuration in the
app, and no stored LLM credentials. Each repo holds its own key in its own GitHub
secrets. Considered and rejected: storing customer keys and shipping them to a
runner at run time — it would make the app a key-distribution service and break
the standing invariant that decrypted credentials never leave the server process.

See [docs/agents/ai-bug-fixer.md](../agents/ai-bug-fixer.md) for setup and operations.
