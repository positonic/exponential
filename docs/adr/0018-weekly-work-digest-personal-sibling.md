# Weekly work digest: a personal, cross-workspace sibling of Week-in-Review

## Status

Accepted — 2026-06-14

## Context

A user wants to see "what I've been working on this week" and feed it into a
social-media content pipeline. Two facts shaped the design:

- The top-level `/activity` page (the **Aggregated activity feed**) is a raw,
  un-summarised list of `WorkspaceActivityEvent` rows across every workspace the
  user belongs to. It shows *all members'* events, reads dry (status changes on
  raw ticket CUIDs), and is not scoped to the viewer's own work.
- A **Week-in-Review** narrative already exists — `WorkspaceWeeklyNarrative`, an
  AI-generated `narrative` + `highlights`, cached per `(workspaceId, isoYear,
  isoWeek)`. It is **per-workspace and team-shared**: one narrative for the whole
  workspace, the same for every member.

What the user needs is neither of those: a synthesis of **their own** work,
**across all their workspaces**, turned into prose plus content ideas. The
obvious-but-wrong move is to extend `WorkspaceWeeklyNarrative` to be per-user —
which would entangle a private, cross-workspace artifact with a shared,
single-workspace one.

## Decision

1. **The Weekly work digest is a distinct artifact, a personal sibling of
   Week-in-Review — not an extension of it.** New cached row keyed
   `(userId, isoYear, isoWeek)`; `WorkspaceWeeklyNarrative` is left untouched.
2. **Subject is Z-scoped and cross-workspace.** It covers events the user
   *acted on* **and** items *assigned to / owned by* them that moved, unioned
   across every workspace they are a member of (direct or team), for the ISO week.
3. **Sources, unioned at read** by a deterministic gatherer: enriched
   activity events (joined to live entities for real titles), the user's
   assigned/owned entities that changed, and **meetings attended** (one-line
   blurb from the meeting summary, title fallback). **A fourth source — the
   user's commits — was planned but is deferred from v1** ([ADR-0019](0019-persist-polled-commits.md)
   is Deferred: the repo-list / identity-claim primitives it needs don't exist
   yet). So v1 ships **three sources**; commits slot in later behind the same
   gatherer interface.
4. **Deterministic gather → one LLM call → cached.** The gatherer assembles a
   structured bundle in code; a single `gpt-4o-mini` call returns the digest
   narrative **and** the **content angles** (≈3 post-idea hooks) in one
   structured response. Generation is **lazy-on-read + cache + in-flight
   coalescing** — the exact shape of `weeklyNarrativeService`, no job queue.
5. **Private to the user.** A digest reads workspace data the user can already
   see, but the digest itself is visible only to its owner.
6. **Surfaced as a panel atop `/activity`.** The digest sits above the
   Aggregated activity feed: "the story of your week" over "every event".
7. **Meetings become an activity source via the internal write-path.** A meeting
   emits `WorkspaceActivityEvent` rows (`created`, then `summarized`) through
   `recordActivity` — ADR-0001's rule for internal data — so it appears in the
   workspace feed, the aggregated feed, and the digest from one write. (Auto-
   summarisation runs as a cron sweep; see Q5 / the meeting-summary work.)

## Considered alternatives

- **Extend `WorkspaceWeeklyNarrative` to be per-user.** Rejected: conflates a
  private, cross-workspace artifact with a shared, single-workspace one; the
  cache key, scope, visibility, and output (angles) all differ. Two clean
  entities beat one overloaded one.
- **Agentic builder (Zoe roams with tools).** Rejected: slow, non-deterministic,
  hard to cache, risks hallucinated accomplishments. The deterministic-gather +
  single-call pattern (ADR-0007 lineage) bounds cost and keeps the digest honest
  — the LLM can only narrate what the gatherer surfaced.
- **Job queue for generation.** Rejected: no queue infra exists, and the
  lazy-on-read + cache + inFlight pattern already in `weeklyNarrativeService`
  covers it. An optional Monday Vercel cron can pre-warm.
- **Read-side union of meetings (GitHub-style) instead of write-path events.**
  Rejected for meetings: they are *internal* data, so ADR-0001's write-path
  applies; persisting once makes them appear everywhere with no per-surface
  plumbing.

## Consequences

- A new cached table (`(userId, isoYear, isoWeek)` → narrative + highlights +
  angles) and a `weeklyWorkDigest` read procedure that performs the (v1)
  three-source gather. The digest and Week-in-Review now share
  gather/cache/regenerate machinery but stay separate rows.
- Digest quality is bounded by the gatherer's richness — correct behaviour (no
  invented accomplishments), and the reason Q4–Q5 invested in real sources.
- The meeting + commit enrichment pays off twice: it also enriches the
  per-workspace activity surfaces, not only the digest.
- "Meetings attended" needs a participant query in the gatherer, not just
  actor=me events — being in a call is not an authored action.
- Content angles are raw material, not posts; platform formatting and draft
  generation are explicitly out of scope for v1.
