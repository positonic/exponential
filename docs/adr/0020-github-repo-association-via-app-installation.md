# GitHub repo association via App installation

## Status

Accepted — 2026-06-15. Supersedes the repo-**declaration** model assumed by
[ADR-0001](0001-activity-feed-storage.md) and [ADR-0019](0019-persist-polled-commits.md)
(paste-a-URL, App-independent, shared-PAT). The downstream **ingestion** decision
(how commit/PR activity actually reaches the feed/digest) is deliberately left
open here — see Consequences.

## Context

ADR-0001 and ADR-0019 assumed a workspace declares a repo by **pasting a
`github.com/owner/repo` URL**, independent of any GitHub App install, with
activity read via a **shared `GITHUB_API_TOKEN` PAT**. ADR-0019 explicitly
*rejected* "require the GitHub App" as "the exact friction ADR-0001 avoided."

When connect + associate was actually built (the `cosmic.anchor` → `cold.maple`
→ `giddy.rune` → `stormy.clover` batch), that model was reversed. A workspace now
connects GitHub by **installing a GitHub App**, and repos are picked from what
the installation can access. The reversal was driven by capabilities the
paste-URL/PAT model can't offer: per-install tokens (no shared-secret leak or
single-account rate-limit ceiling), access to **private** repos, **granular**
GitHub-App permissions, per-workspace isolation, and native **webhook** delivery.

## Decision

1. **A workspace connects GitHub by installing the GitHub App.** The install
   upserts exactly **one** workspace-scoped installation `Integration`
   (`provider=github`, `type=github_app_installation`) holding the encrypted
   installation token and the installation's accessible-repo list.
2. **`WorkspaceRepository` rows are *selected from* the installation's accessible
   repos** (`apps.listReposAccessibleToInstallation`), not pasted as URLs.
   `integrationId` is a **required FK** to that installation `Integration`.
3. **Activity is read with the per-install App token**, never a shared PAT.
4. **A repo can only be tracked if the App is installed on it** with access
   granted. The tracked set is reconciled **idempotently** — save the desired
   `fullName` set; create/delete rows to match.
5. **`WorkspaceRepository` is the source of truth for *which* repos a workspace
   tracks.** Removing a row stops tracking only — it leaves any `GitHubActivity`
   intact.

## Considered alternatives

- **Paste-a-URL + shared PAT (the original ADR-0001/0019 model).** Rejected:
  shared-PAT leak + single-account rate-limit risk, no private-repo access, no
  per-workspace isolation, no native webhooks, and "public repos only, read via
  one shared token" is too weak a foundation for surfacing real commit/PR work.
- **Hybrid — App where installed, PAT fallback for URL-declared repos.** Rejected
  for v1: two declaration paths and two security models that can disagree. Defer
  until there's a concrete need to track a repo *without* an install.

## Consequences

- A workspace **must install the App (and grant repo access)** to track a repo —
  higher friction than paste-a-URL. Accepted for the security/capability gain;
  this is the exact friction ADR-0019 tried to avoid, now consciously accepted.
- **The ingestion mechanism is re-opened.** With a per-install App token *and*
  webhook delivery now available, ADR-0019's "cron-poll via PAT" is no longer the
  only option — webhook-push, App-token polling, and live-fetch are all viable.
  That choice is a separate decision (forthcoming), not settled by this ADR.
- **ADR-0019 stays `Deferred`**, but its "no GitHub App required" / PAT
  declaration premise is **superseded** here.
- The App's **currently-granted permissions** (read: issues, metadata, repository
  hooks) are **insufficient to read commits/PRs**. Surfacing those needs
  `contents: read` + `pull_requests: read` plus `push`/`pull_request` event
  subscriptions — a one-time App-settings change + re-consent (an admin
  prerequisite, tracked separately).
