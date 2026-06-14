# Activity feed: two storage paths, union at read

## Status

Accepted — 2026-05-14

Amended by [ADR-0019](0019-persist-polled-commits.md) (2026-06-14): decisions #3
and #4 below — "GitHub events are not persisted for the panel" and "persist
polled GitHub data on a cron — rejected for v1" — are superseded for **commits**,
which are now cron-polled and persisted to serve the aggregated feed and the
Weekly work digest. The live-fetch union still describes PRs.

## Context

Two append-only event streams already exist:

- **`WorkspaceActivityEvent`** — written by internal `recordActivity()` calls, captures action / ticket / comment events with thin `metadata Json`.
- **`GitHubActivity`** — written by the GitHub App webhook handler (`/api/webhooks/github`), captures push commits, PRs, and PR reviews with heavily denormalised columns (`prTitle`, `commitSha`, `branchName`, etc.). Consumed directly by `SprintAnalyticsService` and `SprintSnapshot`.

The workspace activity panel on `/w/[slug]/home` needs both internal and GitHub events. A three-state switcher (`All` / `Exponential` / `GitHub`) filters by source.

Additionally, a new feature wants workspace members to declare which GitHub repos belong to their workspace by pasting `owner/repo` URLs in workspace settings — without requiring the GitHub App to be installed on every repo.

## Decision

1. **Two event tables stay separate at rest.** No schema merger, no polymorphic events table, no write-mirroring between them.
2. **Activity feed is a read-side union.** `getActivityFeed` reads `WorkspaceActivityEvent` and live-fetches GitHub commits + PRs for each `WorkspaceRepository` row, merges by timestamp in app code.
3. **GitHub events for the panel are not persisted.** Live-fetched via shared `GITHUB_API_TOKEN` PAT (inspired by `impactful-events`), with ~5min server-side cache per repo to absorb refreshes.
4. **The GitHub App webhook path is parallel and untouched.** It continues writing `GitHubActivity` rows for `SprintAnalyticsService`. The two paths can target the same repo with no coordination — they answer different questions (panel = "what happened recently"; analytics = "rolled-up sprint metrics").
5. **`WorkspaceRepository` is the source of truth** for "which repos belong to this workspace's activity panel," independent of any `Integration` row.

## Considered alternatives

- **Write-mirror GitHub events into `WorkspaceActivityEvent`.** Rejected: dual-write creates drift risk, and `GitHubActivity`'s structured columns (used by `SprintAnalyticsService`) would still need to exist — so mirroring is pure cost.
- **Single polymorphic events table** with a `source` discriminator and rich data in `metadata Json`. Rejected: refactoring `SprintAnalyticsService` to query JSON paths is significant blast radius for a UI feature. Also forecloses on a clean home for per-source columns when future sources (Linear, Notion, Slack) need them.
- **Persist polled GitHub data on a cron.** Rejected for v1: page-load fetch with a 5min cache is simpler, fresher, and avoids a background job. Can be added later if rate limits or latency become problems.
- **GitHub App only (no PAT polling).** Rejected: forces every workspace member who wants a repo in the panel to install and authorise a GitHub App, which is far heavier than pasting a URL. The PAT path opens the feature to any public repo immediately and degrades gracefully for private repos (banner the user to install the App).

## Consequences

- The activity feed query has variable latency on first load (one or two GitHub API calls per `WorkspaceRepository`). Mitigated by cache + parallel fan-out + React Query staleness.
- Cross-table pagination is bounded: first page mixes live GitHub + DB internal; "load more" beyond that paginates internal-only. Accepted as a v1 limitation — most users never scroll past page 1.
- Shared PAT means rate limits are workspace-fungible (one heavy workspace can throttle others) and a leak compromises every workspace. Acceptable at current scale; mitigation (per-workspace token, or graduating to GitHub App per repo) is a future slice.
- The same repo can appear in both `WorkspaceRepository` (live-fetch path) and as an `Integration` (webhook path). No deduping logic — they live in different consumers.
- PR reviews are not surfaced in the panel in v1 (REST polling is commit + PR centric; review events require an extra paginated call per PR). Webhook path captures them for analytics regardless.
- The activity panel's heatmap and hero stats stay **internal-only** in v1. GitHub-aware heatmap / stats is a later slice that would need cached aggregates rather than live fetch.
