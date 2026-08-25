# Ticket sync push phase: outbound writes to Notion

## Status

Accepted — 2026-07-13 (documented retroactively 2026-07-22). Decided and scoped as part of the
"Two-way Notion ↔ Exponential ticket sync" feature (Exponential `cmrjitzhj0001l80463eyb6gd`); the
inbound half (8 of 10 tickets) is merged, the outbound half is ticketed as #263 and #264
(`READY_TO_PLAN`, blocked only by an inbound ticket already in QA).

## Context

The **Ticket sync connection** ([ADR-0042](0042-ticket-sync-provenance-and-revert.md)) is pull-only:
`runInboundTicketSync` (`src/server/services/ticketSync/engine.ts`) reads Notion and writes
Exponential, never the reverse. This was deliberate, not incomplete — the three-way merge in
`merge.ts` already computes `applyToRemote` (the fields that changed locally and should propagate
to Notion) on every run; the engine just discards it, pinning the sync snapshot to the *remote*
value instead of the local one specifically so the diff stays visible as a pending outbound change
"once push ships" (`engine.ts` module doc, `buildInboundSnapshot`). The settings UI
(`NotionSyncSettings.tsx`) already renders a disabled "Push changes to Notion" toggle bound to a
reserved `TicketSyncConfig.pushEnabled` field.

The design for the push phase was not, in fact, undecided — it was scoped up front in the same
Exponential feature that produced the inbound half, whose description lays out the full two-way
contract (creation, deletion, field scope, status mapping, cycles, assignees, observability,
rollout) in detail. This ADR exists to give that decision a durable, discoverable record in the
codebase rather than only living in the tracker, and to state explicitly the two properties of the
existing design that constrain it:

- **Echo suppression already exists on the read side.** `RemoteTicketRow.lastEditedByBot` is true
  when a Notion page's last edit was made by our own integration bot — Notion attributes API writes
  to the calling integration's bot user in `last_edited_by`. Once the outbound side writes via the
  API, those writes are already filtered out of the next pull without new detection logic.
- **A bad outbound write is not symmetric with a bad inbound one.** ADR-0042 exists because a wrong
  inbound pull created 99 foreign tickets — noise fully contained inside Exponential and revertible
  by hard-deleting `created` tickets. A bad outbound write lands in the customer's real Notion
  workspace, potentially shared with people outside Exponential, with no equivalent "revert."

## Decision

- **Reuse the merge, add a write phase.** The outbound path calls the same `mergeSyncedFields`
  merge already used inbound. Where `applyToRemote` has entries, it calls the Notion adapter's write
  methods, then advances the `TicketSync.snapshot` to the local value (mirror of what
  `buildInboundSnapshot` already does for `applyToLocal`). No new merge algorithm; the three-way
  merge, base/local/remote model, and last-write-wins conflict rule (ADR-0042) are unchanged and
  apply symmetrically.
- **Push immediately on mutation via a queued job, not a poll.** Unlike inbound (cron poll every
  ~5–15 min), outbound is triggered by the ticket mutation itself, which enqueues a job (the repo's
  existing queued-job pattern) that applies the merge and writes to Notion, with retry on transient
  failure. This gets near-real-time propagation without making the ticket-edit request/response
  depend on Notion API latency — the queue is what decouples them, not a delay-and-batch poll.
- **All synced fields ship together in one connection-level toggle**, not a field-by-field
  allowlist: title, status, priority, type, points, labels, cycle, assignee. Safety comes from the
  toggle itself (opt-in, off by default) plus the backfill dry-run gate below, not from staging
  individual fields into production separately.
- **Sticky status collapse.** Where several Exponential statuses map to one Notion status option,
  pushback only writes Notion when the mapped value actually differs — avoids redundant writes (and
  redundant conflict opportunities) when multiple local statuses are intentionally collapsed to one
  remote option.
- **Full-mirror creation.** Every ticket created in the synced product (human- or agent-authored)
  gets a Notion row on creation — mapped properties, a "Source: Exponential" marker property, body
  copied once as page content, and a back-link to the ticket. The new row gets a sync record
  immediately so the next poll doesn't re-import it.
- **Backfill is opt-in and gated.** Enabling push offers a one-time backfill of existing
  **non-terminal** tickets (excluding DONE, DEPLOYED, ARCHIVED) to Notion, and the real backfill
  cannot run without a dry-run preview having been generated first — the same "preview before first
  real run" shape as inbound's first-sync gate (ADR-0042), applied to the outbound direction.
- **Archive ↔ archive, never hard-delete**, same contract as inbound: setting a synced ticket to
  ARCHIVED trashes its Notion page and tombstones the sync record.
- **Cycles and assignees resolve conservatively outbound.** A ticket's cycle is written to Notion
  only when a matching Notion cycle page already exists; creating a cycle page from an
  Exponential-born cycle is explicitly deferred. Assignee matches by email; no match leaves the
  Notion side untouched and records a warning — the outbound mirror of inbound's "never blank an
  assignment" rule.
- **Outbound runs are first-class in the existing ledger**: push failures (rate limits, permission
  revoked, deleted page) retry and surface as failed items in the run log, never silently dropped.
  The engine-seam "ping-pong" test — push, then the next poll — must produce zero additional writes
  in either direction, proving echo suppression holds end to end.

## Considered alternatives

- **Poll-driven outbound (diff-scan on a cron, symmetric with inbound).** Considered and rejected in
  favor of the queued-job-on-mutation model above: a poll-only outbound would add latency
  proportional to the poll interval for every Exponential-side edit, where a queued job gets
  near-real-time propagation while still decoupling the ticket mutation from Notion API
  latency/failures via the queue rather than via a delay.
- **Field-by-field incremental rollout** (ship scalar fields first, add labels/relations later).
  Rejected in favor of shipping the full field set behind one toggle — the connection-level
  opt-in, the backfill dry-run gate, and per-field warning/skip behavior (unmatched assignee, no
  matching cycle page) were judged sufficient safety without also staging the field surface itself.
- **A new merge/conflict model for outbound.** Rejected — the existing three-way merge already
  computes `applyToRemote` symmetrically with `applyToLocal`; a second algorithm would diverge from
  a decision (LWW-by-edit-timestamp, ADR-0042) already made and load-bearing.
- **Continuous two-way body/comment sync.** Rejected — the body is copied once at creation, after
  which each side owns its copy; comment sync is out of scope entirely. Rich text round-tripping and
  comment authorship/threading are a materially larger, separately-scoped decision if ever pursued.
- **Creating Notion cycle pages from Exponential-born cycles.** Rejected for v1 — deferred alongside
  the rest of the cycle-relation write path; the rest of the ticket still syncs with a warning when
  no matching page exists.

## Consequences

- The outbound writer needs a reverse of the field-mapping module (local value → Notion property
  shape) plus real `pages.update`/`pages.create`/archive calls — the legacy
  `NotionIntegrationAdapter.ts` (Action-level sync, a different entity) is usable prior art for the
  Notion API mechanics, not a template for the merge/ledger design.
- `TicketSyncConfig.pushEnabled` — already reserved in the schema and rendered disabled in the UI —
  becomes live instead of disabled once #263 ships.
- `CONTEXT.md`'s Ticket sync connection entry ("Pull-only today … push is anticipated but unbuilt")
  needs updating once push ships, and a **Push run** / **Outbound sync** term should be added to the
  glossary alongside **Sync run**.
- Operationally riskier than pull: a wrong write reaches the customer's live Notion workspace with
  no revert story. The backfill dry-run gate and per-field warning/skip behavior are the
  mitigations; there is no bulk-undo equivalent to ADR-0042's revert, and the UI must never imply one
  exists for pushed changes.
- Implementation lives in Exponential tickets #263 (`witty.crown` — toggle + outbound property push)
  and #264 (`peppy.raven` — creation full mirror, backfill, outbound archive), both under feature
  `cmrjitzhj0001l80463eyb6gd`. This ADR does not introduce new tickets.

## Amendment (2026-08-06): page-content provenance

The Consequences section above predicted the failure class — "a wrong write reaches the customer's
live Notion workspace with no revert story" — and it happened. A maintenance pass that re-renders
page bodies decided which pages it had authored by scanning the run ledger for
`items[].action === "created"`. Inbound runs write that same token meaning "created a *ticket* from
this page", so every page ever imported from Notion was classified as machine-authored and had its
content deleted. Content that had never been copied into Exponential existed nowhere afterwards.

**Decision.** Page-content provenance is a stamped fact, not an inference:
`TicketSync.remoteCreatedAt` is set at the instant the outbound path creates a page, and it is the
only thing permitted to authorise a content rewrite. A null value means the page is human-authored
and its content is never touched.

**Rejected: keep inferring from the run ledger, scoped by `direction`.** This works — `revert.ts`
already does exactly that and was correct throughout — but it leaves the ambiguous token in place as
a trap for the next consumer, and it cannot answer the question for a page whose creating run has
been pruned. A column costs one nullable field and removes the class of bug.

Because the rewrite is destructive and irreversible, correct provenance alone was judged
insufficient. Content rewrites additionally require a non-empty replacement, a `last_edited_by` that
is our own bot, and content still matching the shape the writer produced; writes are ordered
append-then-delete so an interrupted repair duplicates content rather than erasing it, and are
dry-run unless the caller opts out. Any one of those would have prevented the incident.

Supersedes nothing; it narrows the "body is copied once at creation" stance above by naming who may
rewrite that copy afterwards, and why the answer is a column rather than the ledger.
