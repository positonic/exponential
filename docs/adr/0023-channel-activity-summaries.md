# Channel activity summaries: generic inbound link, summarized in mastra, pushed to a thin endpoint

## Status

Accepted — 2026-06-17. Builds on [ADR-0001](0001-activity-feed-storage.md) (activity feed
storage) and [ADR-0016](0016-agent-activity-writes-reuse-human-path.md) (agent writes reuse the
human path). First provider: WhatsApp.

## Context

We want watched external group chats (WhatsApp first, then Slack/Telegram/…) to post
**periodic AI summaries** into a workspace's **Activity feed** — surfacing project-relevant
signal ("3 messages about the Friday release; Alice is blocked on the API key"), not a raw chat
log. The raw fidelity appetite is already served by the `../mastra` gateway's per-message Notion
capture; this is a different, signal-only surface.

The pieces live in two repos: raw WhatsApp messages are in `../mastra`'s own Postgres; the
activity feed, the channel→destination link, and the `WorkspaceActivityEvent` write are in
exponential. `SlackChannelConfig` already exists but is **outbound** (exponential → Slack
notification routing) and `Integration`-FK-bound — the wrong shape for an inbound feed.

## Decision

1. **Generic inbound `ChannelLink`, not a WhatsApp-specific model.** `ChannelLink { provider,
   externalId, displayName?, workspaceId, projectId?, isActive, createdById }`, unique on
   `(provider, externalId)`. It is the **routing** authority (where a conversation's summary
   lands: required workspace, optional project). It sits beside the outbound `SlackChannelConfig`
   (which may converge onto it later) and is integration-free. For WhatsApp it sits above the
   gateway's `WHATSAPP_CAPTURE_GROUP_JIDS` env allowlist, which stays the **watching** authority.
2. **Reuse `WorkspaceActivityEvent`, no new table.** Each summary is one row, `entityType:
   "channel_summary"`, `action: "summarized"`; summary text + `provider` + `externalId` +
   `displayName` + optional `projectId` + message count + window bounds live in `metadata Json`.
   Per ADR-0001's test, a narrative summary has neither a distinct shape nor a second consumer, so
   a separate table (the reason GitHub got one) is unwarranted. It reaches the Aggregated activity
   feed and Weekly work digest for free. The **Activity source** chip derives **read-side from
   `metadata.provider`** — one chip per provider — never a new column.
3. **Summarize in mastra; push, don't pull.** A new periodic job in the gateway (default cadence
   24h, global env constant) summarizes each watched group over the window since its last
   summary and POSTs **one** finished summary to a new exponential endpoint
   `recordChannelSummary` (agent JWT). Raw messages never leave mastra; exponential receives only
   the summary tagged with `(provider, externalId)` and routes by the `ChannelLink`. A summary
   with no matching link is dropped.
4. **Window = "since last summary", advance-on-success.** mastra stores `lastSummarizedAt` per
   group and only advances it after a 2xx — so a failed/dropped POST re-summarizes the same
   window next tick (at-least-once, no lost windows). exponential dedups by
   `(provider, externalId, windowStart)`, upserting rather than inserting a duplicate feed row.
5. **Suppress empty windows.** Zero messages → skip without calling the model; otherwise the
   prompt returns empty when nothing project-relevant happened, and mastra skips the POST. The
   feed never shows "no activity".
6. **Attribution: `userId = ChannelLink.createdById`, actor rendered as the channel.** The event
   carries the connector's id for ownership/audit, but the feed row renders provider icon +
   `displayName`, never a human avatar — it never looks like a person posted it.

## Considered alternatives

- **Reuse `SlackChannelConfig`.** Rejected: it's outbound and `Integration`-FK-bound; WhatsApp's
  gateway has no `Integration` row. Wrong direction, wrong coupling.
- **WhatsApp-specific `WhatsAppGroupLink`.** Rejected: a generic `ChannelLink` costs nothing more
  and Slack/Telegram are explicitly anticipated.
- **New `ChannelActivity` table (mirror `GitHubActivity`).** Rejected per ADR-0001 — no distinct
  shape, single consumer.
- **Pull from exponential (cron here reads a gateway endpoint, summarizes here).** Rejected: the
  cadence config and the message store both live in mastra, summarizing there keeps raw text in
  mastra, and a one-way push (mastra → thin routing endpoint) avoids two-way config coupling.
  Trade-off accepted: cadence lives in mastra, not beside the link.
- **Repoint the per-message Notion writer at exponential.** Rejected: one feed row per chat line
  is the flood this feature exists to avoid.

## Consequences

- Two layers for "watched": the env allowlist (mastra, *capture*) and `ChannelLink` (exponential,
  *routing*). A group must be in both to produce summaries. Accepted; a settings UI can later
  drive both.
- Cadence (24h) is a mastra-side env constant; per-group cadence would move into `ChannelLink`
  later.
- v1 has no settings UI — the single link is seeded via a `channelLink` tRPC mutation. The card
  that lists participating groups (via the gateway `GET …/groups`) and assigns workspace/project
  is the obvious fast-follow, and pairs with "add another group".
- A new cross-repo contract (`recordChannelSummary`) must stay in sync between the repos.
