# AI Bug Fixer

An autonomous worker that does work you explicitly hand it. When a ticket carries
a **trigger label** and is `READY_TO_PLAN`, a scheduled GitHub Action picks it up,
writes the change, validates it, and opens a **pull request for human review**. It
never merges and never deploys.

Design rationale: [ADR-0029](../adr/0029-ai-bug-fixer-workflow.md). Close-out (PR
merge → ticket `DONE`) is handled by the existing webhook in
[ADR-0021](../adr/0021-pr-merge-promotes-ticket-via-app-webhook.md).

## The two profiles

| | `ai-fixable` | `ai-buildable` |
| --- | --- | --- |
| For | bugs | features |
| Brief framing | smallest change that fixes it | build what the ticket describes |
| Validation | `tsc` + `next lint` | `tsc` + `next lint`, **plus no schema/migration edits** |
| Commit prefix | `fix:` | `feat:` |

Both profiles share everything else: the same scan, claim, agent, PR and release
logic. The label is the gate, not the ticket type — `type` only steers the brief's
wording.

The schema ban on `ai-buildable` is mechanical (a `git status` check), not an
instruction the model can ignore. It exists because preview deploys run
`next build` only, never `prisma migrate deploy`, so a schema change can never
reach a preview database — the feature would look broken for reasons unrelated
to the agent's work. A bug fix that legitimately needs a migration is still
allowed under `ai-fixable`, and still goes through human review.

## How a ticket becomes eligible

A ticket is attempted only when **all** of these hold:

| Condition | Why |
| --- | --- |
| `status = READY_TO_PLAN` | the documented "ready for an AFK agent" state |
| has **`ai-fixable`** or **`ai-buildable`** | explicit opt-in |
| **not** labelled `security` | safety: humans handle security |
| `priority` is not `0` (critical) | safety: humans handle critical |

To hand work to the worker: write a clear ticket body, then

```bash
exponential tickets update --id <ticket-cuid> --status READY_TO_PLAN --add-label ai-buildable
```

The worker picks the **oldest** eligible ticket each run (FIFO). A ticket carrying
both labels is worked as `ai-fixable` — the stricter profile.

> `--label` on the CLI ANDs, so "either label" cannot be one query. The scan runs
> one list per label and `select-candidate.mjs` merges them, remembering which
> query produced each ticket.

## What the worker does

1. **Scan** (cheap, CLI only): one list per trigger label, merge, subtract
   `security`, drop `priority 0`, respect the open-PR cap, pick the oldest.
2. **Claim:** move the ticket to `IN_PROGRESS`, add `ai-in-progress`, comment.
3. **Brief + build:** render the ticket into `.ai-bug-fixer/prompt.md` and run
   the Claude Code CLI against it on a new `ai/ticket-<n>-<slug>` branch. The
   agent is allow-listed to `Read,Write,Edit,Glob,Grep` — **no Bash**, so it
   cannot run git, and cannot shell out with an API key in its environment.
4. **Guard** (`ai-buildable` only): fail if `prisma/schema.prisma` or
   `prisma/migrations` changed.
5. **Validate:** `npx tsc --noEmit` + `npx next lint` (same checks as CI).
6. **Open PR** (labelled `ai-bug-fixer`), set the ticket to `QA`, link `prUrl` +
   `branchName`, remove `ai-in-progress`, comment with the PR link. **Never merges.**
7. If the work fails, is empty, trips the guard, or the agent flags it as needing
   a human, the ticket is **released back to `READY_TO_PLAN`** with an
   explanatory comment.

The agent's output is written to a file, not the log — this repo is public and
Actions logs are world-readable. On failure the last 30 lines are surfaced so a
broken worker cannot fail silently; `debug_output` prints everything.

A human reviews and merges the PR. On merge, the ADR-0021 webhook flips the ticket
`QA → DONE`.

## One-time setup

### Secrets (`gh secret set …`)

| Secret | Required | Purpose |
| --- | --- | --- |
| `EXPONENTIAL_TOKEN` | yes | Bot JWT for the CLI. Get it with `exponential auth show --token`. Prefer a dedicated service-account user over a personal token. |
| `AI_BUILDER_API_KEY` | yes | The LLM key. An OpenRouter key by default; an Anthropic key if you clear `AI_BUILDER_BASE_URL`. Checked in the cheap scan job so a missing key fails **before** a ticket is claimed. |
| `AI_BUG_FIXER_GH_TOKEN` | optional | A PAT used to push the branch and open the PR. Set this so the PR **triggers CI** — PRs opened by the default `GITHUB_TOKEN` do not. Falls back to `GITHUB_TOKEN`. |

`CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` are **no longer used** by this
workflow. The agent is the Claude Code CLI called directly against a configurable
endpoint; it reads `AI_BUILDER_API_KEY` only, and blanks `ANTHROPIC_API_KEY` in
its environment so a leftover Anthropic key cannot silently bill the wrong
account.

### Repository variables (`gh variable set …`)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `EXPONENTIAL_API_URL` | yes | — | e.g. `https://www.exponential.im` |
| `EXPONENTIAL_PRODUCT` | yes | — | Product slug or CUID whose backlog to scan |
| `EXPONENTIAL_WORKSPACE` | yes | — | Workspace slug or CUID (e.g. `syntrofi`). Required — the CLI resolves `--label` slugs against the workspace, so label filtering fails without it even with a CUID product. |
| `AI_BUILDER_MODEL` | no | `z-ai/glm-5.2` | Coding-agent model, as the endpoint names it |
| `AI_BUILDER_BASE_URL` | no | `https://openrouter.ai/api` | Anthropic-compatible endpoint. Note `/api`, **not** `/api/v1` — the SDK appends its own path. Set to empty to talk to Anthropic directly (then `AI_BUILDER_MODEL` must be an Anthropic model id). |
| `AI_BUILDER_MAX_USD` | no | `2` | Hard per-run spend ceiling passed to `--max-budget-usd` |
| `AI_BUG_FIXER_MAX_OPEN_PRS` | no | `3` | Skip new work while this many AI PRs are open |

The old `AI_BUG_FIXER_MODEL` variable is deliberately **not** read any more: it
named an Anthropic model, and a stale value left in repo settings would be sent
to OpenRouter, which does not know it. Delete it if it is set.

### Using a different provider

Any endpoint that speaks the Anthropic Messages protocol works. OpenRouter's
covers OpenAI and Anthropic models too, so "which provider" is usually just a
different `AI_BUILDER_MODEL` string rather than a different endpoint.

### Using this in another repo

Copy `.github/workflows/ai-bug-fixer.yml` plus `scripts/ai-bug-fixer/` into the
target repo and set the secrets and variables above. **No credential is stored in
Exponential** — each repo holds its own LLM key in its own GitHub secrets, and the
app never sees it.

### Running it

- **Automatically:** hourly via cron.
- **On demand:** Actions → *AI Bug Fixer* → *Run workflow*. Optional inputs:
  `ticket_id` (target one specific ticket) and `model` (one-off model override).

## Cost controls

The biggest levers, all wired in: the opt-in labels (nothing is touched unless
tagged), **one ticket per run**, the **open-PR cap**, an **hourly** cadence, a
**cheap default model**, a `--max-turns 30` ceiling, and a hard
`--max-budget-usd` ceiling per run. Candidate scanning is free — tokens are only
spent once a real ticket is claimed.

**Billing is now metered, not flat.** ADR-0029 originally leaned on a Claude
subscription token (flat fee). Moving to OpenRouter trades that for per-token
billing, which is why `--max-budget-usd` was added. At GLM 5.2's rates
(~$0.63/M input, ~$1.97/M output) a run costs cents, but it is no longer free.

## Safety guarantees

- Never auto-merges, never auto-deploys — only opens PRs.
- Never attempts `security`-labelled or `priority 0` (critical) tickets.
- The agent has **no Bash tool** — it edits files and nothing else.
- `ai-buildable` cannot change the database schema (enforced by diff, not prompt).
- The brief instructs a **narrow** fix and tells the agent to bail (writing
  `.ai-bug-fixer/needs-human.txt`) if the fix would be broad or risky.
- A failed/empty/bailed attempt releases the ticket back to `READY_TO_PLAN`
  rather than leaving it stuck.
- Single-runner `concurrency` prevents overlapping runs grabbing the same ticket.

## Files

- `.github/workflows/ai-bug-fixer.yml` — the workflow (`scan` + `fix` jobs)
- `scripts/ai-bug-fixer/select-candidate.mjs` — eligibility + oldest-first pick
- `scripts/ai-bug-fixer/render-prompt.mjs` — ticket JSON → agent brief
