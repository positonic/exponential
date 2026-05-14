# Issue tracker: Exponential

Issues and PRDs for this repo live in [Exponential](https://www.exponential.im). Use the `exponential` CLI for all operations. Add `--json` to any command (or pipe it) to get machine-readable output.

## This repo's coordinates

- **Workspace**: `syntrofi` (CUID `cmk01wbrb000arzxzj8zy4czg`)
- **Product**: `exponential` (CUID `cmp2ztu9y0003jv04kk2l8sm0`)
- **Default feature**: _none_ — tickets in this repo roll up under multiple features (Activity dashboard, Coaching layout, Test Harness, …). Pass `--feature <feature-cuid>` explicitly when creating tickets that belong to a specific feature.

`exponential workspaces set-default <workspace-slug>` is set on the local CLI, so `--workspace` can be omitted in most commands. `--product` is always required.

## Hierarchy

`workspace → product → feature → ticket`. Epics are workspace-scoped and can group tickets across products.

A **feature** is the PRD-shaped unit (an outcome with a vision). A **ticket** is a unit of work (bug, feature slice, chore, etc.).

## Conventions

- **Create a ticket**: `exponential tickets create --product exponential --type <TYPE> --status <STATUS> -t "<title>" -b "<body>" [--feature <feature-cuid>] [--epic <epic-cuid>] --json`. Use a heredoc for multi-line bodies.
- **Read a ticket**: `exponential tickets get <ticket-cuid> --json` (returns dependencies, actions, and comments).
- **List tickets**: `exponential tickets list --product exponential [--status <STATUS>] [--type <TYPE>] [--feature <cuid>] [--assignee <user-id>] --json`. Status filtering is server-side — prefer that to client-side filtering.
- **Comment on a ticket**: `exponential tickets comment add --id <ticket-cuid> -m "<body>"`.
- **Change a ticket's status**: `exponential tickets update --id <ticket-cuid> --status <STATUS>`.
- **Archive (close)**: `exponential tickets update --id <ticket-cuid> --status ARCHIVED`.
- **Create a feature (for PRDs)**: `exponential features create --product exponential -n "<name>" -d "<description>" --vision "<target outcome>" --status DEFINED --json`.

### Ticket types

`BUG`, `FEATURE`, `CHORE`, `IMPROVEMENT`, `SPIKE`, `RESEARCH`.

### Ticket statuses

`BACKLOG`, `NEEDS_REFINEMENT`, `READY_TO_PLAN`, `COMMITTED`, `IN_PROGRESS`, `BLOCKED`, `QA`, `DONE`, `DEPLOYED`, `ARCHIVED`.

### Feature statuses

`IDEA`, `DEFINED`, `IN_PROGRESS`, `SHIPPED`, `ARCHIVED`.

## Triage role → ticket status mapping

The `/triage` skill routes by `ticket.status` alone — no body markers or sentinel comments needed.

| Triage role | `ticket.status` | Notes |
|---|---|---|
| `needs-triage` | `BACKLOG` | Default landing state for new tickets |
| `needs-info` | `NEEDS_REFINEMENT` | + a comment carrying the actual clarifying question |
| `ready-for-agent` | `READY_TO_PLAN` | Agent picks these up |
| `ready-for-human` | `BLOCKED` | Semantic: blocked on human availability or judgement |
| `wontfix` | `ARCHIVED` | Terminal |

So each triage queue is a single `tickets list --status <STATUS>` call:

```bash
exponential tickets list --product exponential --status BACKLOG --json          # needs-triage
exponential tickets list --product exponential --status NEEDS_REFINEMENT --json # needs-info
exponential tickets list --product exponential --status READY_TO_PLAN --json    # ready-for-agent
exponential tickets list --product exponential --status BLOCKED --json          # ready-for-human
```

## When a skill says "publish to the issue tracker"

- If the source is a **plan, spec, or PRD that needs to be broken into multiple tickets**: invoke `/to-expo`. It handles vertical slicing, dependency wiring, and decision comments.
- If the source is a **single ticket** (e.g. a PRD as a feature, or a one-off bug): run `exponential tickets create ...` directly, or `exponential features create ...` for PRD-shaped work.

## When a skill says "fetch the relevant ticket"

Run `exponential tickets get <ticket-cuid> --json`. The output includes the ticket body, status, dependencies, linked actions, and the full comment thread.

## Relationship to beads (`bd`)

This repo ALSO uses [beads](https://github.com/beads-project/beads) for fine-grained, code-adjacent task tracking (see `CLAUDE.md` → "Beads Workflow"). Rough division of labour:

- **Exponential tickets** — product-facing work items: features, PRDs, bugs that span multiple commits, items that should be visible to non-engineers.
- **Beads issues** — implementation-scope tracking inside a single session or PR: "I'm about to write code, claim it, close it when committed."

When in doubt for skill-driven flows (`/triage`, `/to-issues`, `/to-prd`, `/qa`), use **Exponential**. Beads remains the right answer for the day-to-day `bd ready → bd update → bd close` loop.
