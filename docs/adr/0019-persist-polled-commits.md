# Persist polled commits for the aggregated feed and digest

## Status

Accepted — 2026-06-14

Amends [ADR-0001](0001-activity-feed-storage.md) decision #3 ("GitHub events for
the panel are not persisted") and #4 ("persist polled GitHub data on a cron —
rejected for v1").

## Context

ADR-0001 deliberately kept GitHub out of storage for the activity panel:
commits + PRs are **live-fetched** per `WorkspaceRepository` on page load (shared
PAT, ~5min cache), unioned in app code, never persisted. It explicitly rejected
cron-polling-into-storage *for v1*, noting it "can be added later if rate limits
or latency become problems."

Two new requirements make live-fetch insufficient:

- **Commits in the global feed.** The **Aggregated activity feed** (`/activity`)
  reads only `WorkspaceActivityEvent`. Live-fetched commits never reach it, and
  live-fetching across *every* workspace × repo on one page is an unbounded
  fan-out.
- **Weekly commit summarisation for the Weekly work digest** ([ADR-0018](0018-weekly-work-digest-personal-sibling.md)).
  Summarising "what you shipped this week" from live-fetch means an N-repo API
  fan-out per digest — slow and rate-limit-prone — with no author/time index.

Most of the user's real work lives in Git, so commits are the highest-signal
source for "what I'm working on". The `GitHubActivity` table already persists
commit fields (`commitSha`, `commitMessage`, `commitAuthor`, `branchName`,
`workspaceId`) — but only for repos with the **GitHub App webhook** installed,
and it is consumed by Sprint Analytics, not the feed.

## Decision

1. **Cron-poll commits per `WorkspaceRepository` and persist them.** A Vercel
   cron fetches each declared repo's recent commits via the existing PAT path and
   **upserts by `commitSha`**. No GitHub App install required — it works for any
   repo a workspace has declared.
2. **Store per-commit, render grouped.** Rows are per-commit (needed for accurate
   author/time and as a digest source), but feeds render a grouped roll-up
   ("pushed 7 commits to `exponential`"), not one row per commit.
3. **"Mine" is the GitHub identity claim.** A commit is attributed to a user by
   matching `commitAuthor` to `User.githubLogin` (the OAuth-verified claim) —
   never free-text.
4. **All feeds read the persisted commits — one source of truth.** The
   per-workspace panel **switches from live-fetch to reading persisted commits**,
   the same rows the aggregated feed and digest read. Commit live-fetch for the
   panel is retired.
5. **The webhook `GitHubActivity` / Sprint Analytics path is untouched.** It
   keeps serving analytics independently; this decision is about the
   feed/digest read model.

## Considered alternatives

- **Keep live-fetch, extend the union to the global feed + digest.** Rejected:
  doesn't scale to "global" (fan-out across all workspaces × repos per request),
  no author/time index for weekly queries, and the aggregated feed can't union
  live data cheaply.
- **Per-workspace panel keeps live-fetch; only global/digest read persisted.**
  Rejected (this is the "reconciliation" sub-decision): two commit code paths
  that can disagree, for the sake of seconds-vs-minutes freshness. One source of
  truth wins; the cron lag (minutes) is acceptable for an activity feed.
- **Require the GitHub App webhook (reuse `GitHubActivity` as-is).** Rejected:
  forces every workspace to install + authorise the App, the exact friction
  ADR-0001 avoided with the PAT path. Cron-poll keeps the low-friction
  declaration model.
- **Daily commit roll-up rows instead of per-commit.** Rejected for storage:
  loses the author/time granularity the digest needs. Roll-up is a *render*
  concern (decision #2), not a storage one.

## Consequences

- A persisted commit store (extend `GitHubActivity` or a thin commits table) +
  a cron poller keyed for idempotent upsert by `commitSha`.
- Commit freshness in all feeds is now bounded by the cron interval (~15 min),
  not real time — an accepted trade for consistency and a single code path.
- The shared-PAT rate-limit and leak risks ADR-0001 flagged still apply to the
  poller; per-workspace tokens remain a future slice.
- A repo may appear in both this poll path and the webhook `GitHubActivity` path;
  they stay independent (feed/digest vs. analytics), no dedupe between them.
- ADR-0001's commit live-fetch for the panel is removed; PR live-fetch behaviour
  outside this scope is unchanged until a follow-up addresses PRs.
