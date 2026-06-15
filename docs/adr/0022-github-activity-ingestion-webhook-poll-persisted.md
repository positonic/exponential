# GitHub activity ingestion: webhook + poll, persisted to GitHubActivity via the App token

## Status

Accepted — 2026-06-15. **Amends** [ADR-0001](0001-activity-feed-storage.md)
decisions #3–#5 (GitHub not persisted for the panel; live-fetch). **Replaces the
ingestion mechanism** of [ADR-0019](0019-persist-polled-commits.md) (cron-poll via
shared PAT) — its persist-per-commit / render-grouped / attribute-by-claim intent
(#2–#4) still holds. Builds on [ADR-0020](0020-github-repo-association-via-app-installation.md)
(App installation + per-install token) and shares the webhook handler with
[ADR-0021](0021-pr-merge-promotes-ticket-via-app-webhook.md).

## Context

ADR-0001 kept GitHub out of storage for the activity panel — live-fetched per
`WorkspaceRepository` (shared PAT, ~5 min cache), never persisted — but
anticipated cron-polling-into-storage "later if rate-limits or latency bite."
ADR-0019 chose poll+persist (still PAT) but was `Deferred` for missing
primitives. ADR-0020 shipped those primitives (`WorkspaceRepository` + per-install
App token), and ADR-0021's merge-automation needs a webhook regardless. Two
requirements push past live-fetch: commits/PRs in the cross-workspace
**Aggregated activity feed**, and weekly summarisation in the **Weekly work
digest** — both need an author/time index and can't fan out live per request.

## Decision

1. **Ingest via both a webhook and a poll**, into one persisted store:
   - **Webhook** (App `pull_request`, and `push` for commits): real-time; drives
     ADR-0021's merge-automation and real-time PR/commit rows.
   - **Poll** (cron, per-install **App token**): backfill at connect time, commit
     history, and **reconciliation** of missed webhook deliveries.
2. **One store — `GitHubActivity`.** Both writers **upsert**; dedup by
   `externalId` (commit SHA / PR node-id), `deliveryId` for webhook idempotency.
   Rows are scoped **per tracking workspace** → dedup key `(workspaceId, externalId)`.
3. **Read with the per-install App token, never a shared PAT** (ADR-0020). The
   shared `GITHUB_API_TOKEN` panel path is retired.
4. **Feeds read the persisted rows.** The per-workspace **Activity feed** unions
   `WorkspaceActivityEvent` with `GitHubActivity` scoped to the workspace's tracked
   repos (`repoFullName ∈ WorkspaceRepository`); the **Aggregated activity feed**
   and **Weekly work digest** read the same rows. Per-commit stored, **rendered
   grouped** (ADR-0019 #2).
5. **Sprint Analytics keeps reading `GitHubActivity` unchanged** — one store, two
   read consumers (feed/digest + analytics).

## Considered alternatives

- **Keep live-fetch (ADR-0001).** Rejected: doesn't scale to the Aggregated feed
  (per-request fan-out across all workspaces × repos) or the weekly digest (no
  author/time index).
- **Webhook-only.** Rejected: no backfill (feed empty until the next push) and
  needs reconciliation for missed deliveries — i.e. it needs a poll anyway.
- **Poll-only.** Rejected: ADR-0021's merge-automation is an event-triggered
  side-effect that wants real-time; ~15 min poll lag is wrong for closing a ticket.
- **Two tables (separate feed store vs analytics store).** Rejected: `GitHubActivity`
  already has the shape and workspace scope; one store with two read consumers is
  simpler, no cross-table dedupe.
- **Shared PAT (ADR-0019 #1).** Rejected: the per-install App token removes the
  shared-secret leak + single-account rate-limit ceiling ADR-0019 flagged as a
  "future slice."

## Consequences

- Freshness is **real-time** for subscribed webhook events and bounded by the
  **cron interval (~15 min)** for poll-only gaps — accepted.
- Requires App permissions `contents: read` + `pull_requests: read` and
  `push` / `pull_request` event subscriptions (admin one-time; also ADR-0021's
  prerequisite).
- ADR-0001's panel live-fetch and the shared `GITHUB_API_TOKEN` path are retired
  for the feed.
- `GitHubActivity` now has feed/digest **and** analytics consumers — schema
  changes must consider both.
- "Mine" attribution in the digest still needs the **GitHub identity claim**
  (`User.githubLogin`) — a separate, not-yet-built primitive (next decision).
