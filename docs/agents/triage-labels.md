# Triage Labels

The skills speak in terms of five canonical triage roles. This repo's issue tracker (Exponential) doesn't use labels — it uses **ticket statuses** as the routing primitive. The mapping below is the canonical translation; the same mapping also lives in [`issue-tracker.md`](./issue-tracker.md) for convenience.

| Label in mattpocock/skills | Exponential `ticket.status` | Meaning                                  |
| -------------------------- | --------------------------- | ---------------------------------------- |
| `needs-triage`             | `BACKLOG`                   | Maintainer needs to evaluate this ticket |
| `needs-info`               | `NEEDS_REFINEMENT`          | Waiting on reporter for more information |
| `ready-for-agent`          | `READY_TO_PLAN`             | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `BLOCKED`                   | Requires human implementation            |
| `wontfix`                  | `ARCHIVED`                  | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), translate it to the corresponding `ticket.status` and use `exponential tickets update --id <cuid> --status <STATUS>`.

`/triage` routes by `ticket.status` alone — no body markers or sentinel comments are needed beyond the optional `needs-info` clarifying question (which goes in a comment, not the label).
