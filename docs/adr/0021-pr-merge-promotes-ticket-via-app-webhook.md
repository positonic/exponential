# PR merge auto-promotes the linked ticket via the central App webhook

## Status

Accepted — 2026-06-15. Supersedes the per-repo GitHub Action approach
(`/setup-merge-hook` → `exponential-promote.yml`) as the **default** way tickets
are promoted on merge. Builds on [ADR-0020](0020-github-repo-association-via-app-installation.md)
(App installation) and the forthcoming GitHub-activity **ingestion** ADR (the
shared webhook handler).

## Context

`/ship-ticket` links a `Ticket` to its PR (`Ticket.prUrl`) and leaves it in
`QA`. This repo has **no auto-promotion** today — shipped tickets sit in `QA`
until moved by hand (observed directly: the connect+associate batch's tickets
stayed in `QA` and were closed manually).

The existing `/setup-merge-hook` skill scaffolds a **per-repo GitHub Action**
that promotes `QA → DONE` on merge into the deploy trigger, via the **external**
Exponential API (`EXPONENTIAL_TOKEN` secret). Per ADR-0020, every tracked repo
now has a GitHub App installation that already delivers **signature-verified
`pull_request` webhooks** to `/api/webhooks/github`. That makes a **central,
in-app** promotion possible — no per-repo workflow files, no API tokens.

## Decision

1. On `pull_request` `action=closed` with **`merged === true`**, the webhook
   handler looks up `Ticket where prUrl === pull_request.html_url`.
2. If found **and currently `QA`**, transition to `DONE`. The `QA`-only guard
   means we never clobber a hand-moved, already-`DONE`, or `ARCHIVED` ticket, and
   never reopen anything — making the handler idempotent.
3. Match is by **exact PR URL** — no base-branch gate. A ticket's stored PR URL
   is unique to that PR, so a feature-branch merge can't accidentally match.
4. `DEPLOYED` is reserved for a future **production-deploy** signal. A PR merge
   is `DONE`, not `DEPLOYED`.
5. This central webhook is the **default** and supersedes the per-repo
   `exponential-promote.yml` Action; a repo using the App webhook should not also
   run the Action.

## Considered alternatives

- **Per-repo GitHub Action (status-quo skill).** Rejected as default: per-repo
  workflow + secret, an external API hop, only works on repos you control, and
  doesn't scale to "every workspace repository."
- **Base-branch-gated promotion (only merge into `main`/deploy-trigger).**
  Rejected for v1: the exact-PR-URL match is already precise, and cross-repo we
  don't know each repo's deploy branch. Revisit alongside `DEPLOYED`.
- **Promote from any status.** Rejected: clobbers manual state. The `QA`-only
  guard keeps it safe and idempotent.

## Consequences

- The auto-promote the repo lacked now exists, centrally: ship-ticket → `QA` →
  (PR merges) → `DONE`, no hand-move.
- Requires the App to subscribe to `pull_request` and hold `pull_requests: read`
  (the ingestion prerequisite — admin one-time).
- A ticket whose PR merges into `develop` (not prod) goes `DONE`, not
  `DEPLOYED` — accepted for v1; `DEPLOYED` is a later refinement.
- The per-repo Action and this webhook must not both run for one repo
  (double-promote). The App webhook is the default; disable the Action there.
