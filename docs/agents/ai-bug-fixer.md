# AI Bug Fixer

An autonomous worker that fixes bugs you explicitly hand it. When a `type = BUG`
ticket is marked `ai-fixable` and is `READY_TO_PLAN`, a scheduled GitHub Action
picks it up, writes a narrow fix, validates it, and opens a **pull request for
human review**. It never merges and never deploys.

Design rationale: [ADR-0029](../adr/0029-ai-bug-fixer-workflow.md). Close-out (PR
merge → ticket `DONE`) is handled by the existing webhook in
[ADR-0021](../adr/0021-pr-merge-promotes-ticket-via-app-webhook.md).

## How a bug becomes eligible

A ticket is attempted only when **all** of these hold:

| Condition | Why |
| --- | --- |
| `type = BUG` | only bugs, not features/chores |
| `status = READY_TO_PLAN` | the documented "ready for an AFK agent" state |
| has the **`ai-fixable`** label | explicit human opt-in |
| **not** labelled `security` | safety: humans handle security |
| `priority` is not `0` (critical) | safety: humans handle critical |

To hand a bug to the worker: write a clear reproduction in the ticket body, then

```bash
exponential tickets update --id <ticket-cuid> --status READY_TO_PLAN --add-label ai-fixable
```

The worker picks the **oldest** eligible ticket each run (FIFO).

## What the worker does

1. **Scan** (cheap, CLI only): list eligible bugs, subtract `security`, drop
   `priority 0`, respect the open-PR cap, pick the oldest.
2. **Claim:** move the ticket to `IN_PROGRESS`, add `ai-in-progress`, comment.
3. **Brief + fix:** render the ticket into `.ai-bug-fixer/prompt.md` and run
   `claude-code-action` against it on a new `ai/bug-<n>-<slug>` branch.
4. **Validate:** `npx tsc --noEmit` + `npx next lint` (same checks as CI).
5. **Open PR** (labelled `ai-bug-fixer`), set the ticket to `QA`, link `prUrl` +
   `branchName`, remove `ai-in-progress`, comment with the PR link. **Never merges.**
6. If the fix fails, is empty, or the agent flags it as needing a human, the
   ticket is **released back to `READY_TO_PLAN`** with an explanatory comment.

A human reviews and merges the PR. On merge, the ADR-0021 webhook flips the ticket
`QA → DONE`.

## One-time setup

### Secrets (`gh secret set …`)

| Secret | Required | Purpose |
| --- | --- | --- |
| `EXPONENTIAL_TOKEN` | yes | Bot JWT for the CLI. Get it with `exponential auth show --token`. Prefer a dedicated service-account user over a personal token. |
| `CLAUDE_CODE_OAUTH_TOKEN` | yes | Claude Pro/Max subscription token for the coding agent (flat fee). Alternatively switch the action to `anthropic_api_key`. |
| `AI_BUG_FIXER_GH_TOKEN` | optional | A PAT used to push the branch and open the PR. Set this so the PR **triggers CI** — PRs opened by the default `GITHUB_TOKEN` do not. Falls back to `GITHUB_TOKEN`. |

### Repository variables (`gh variable set …`)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `EXPONENTIAL_API_URL` | yes | — | e.g. `https://www.exponential.im` |
| `EXPONENTIAL_PRODUCT` | yes | — | Product slug or CUID whose bug backlog to scan |
| `AI_BUG_FIXER_MODEL` | no | `claude-haiku-4-5` | Coding-agent model |
| `AI_BUG_FIXER_MAX_OPEN_PRS` | no | `3` | Skip new fixes while this many AI PRs are open |

### Running it

- **Automatically:** hourly via cron.
- **On demand:** Actions → *AI Bug Fixer* → *Run workflow*. Optional inputs:
  `ticket_id` (target one specific ticket) and `model` (one-off model override).

## Cost controls

The biggest levers, all already wired in: the opt-in `ai-fixable` tag (nothing is
touched unless tagged), **one ticket per run**, the **open-PR cap**, an **hourly**
cadence, a **cheap default model**, a `--max-turns 30` ceiling, and the
**subscription token** (flat fee rather than metered). Candidate scanning is
free — agent tokens are only spent once a real ticket is claimed.

## Safety guarantees

- Never auto-merges, never auto-deploys — only opens PRs.
- Never attempts `security`-labelled or `priority 0` (critical) tickets.
- The brief instructs a **narrow** fix and tells the agent to bail (writing
  `.ai-bug-fixer/needs-human.txt`) if the fix would be broad or risky.
- A failed/empty/bailed attempt releases the ticket back to `READY_TO_PLAN`
  rather than leaving it stuck.
- Single-runner `concurrency` prevents overlapping runs grabbing the same ticket.

## Files

- `.github/workflows/ai-bug-fixer.yml` — the workflow (`scan` + `fix` jobs)
- `scripts/ai-bug-fixer/select-candidate.mjs` — eligibility + oldest-first pick
- `scripts/ai-bug-fixer/render-prompt.mjs` — ticket JSON → agent brief
