# Outbound posts: the destination-keyed sibling of the notification pipeline

## Status

Accepted — 2026-10-27. Beside [ADR-0045](0045-unified-notification-dispatch.md) (person-keyed
dispatch), amending [ADR-0023](0023-channel-activity-summaries.md) (`ChannelLink`). Extends
[ADR-0070](0070-agents-propose-decisions-people-confirm.md) to room posts. Decisions D-0055,
D-0056, D-0057.

## Context

Four features post into chat rooms, each with its own plumbing: meeting summaries
(`postMeetingSummaryToMatrix`, `MatrixPostLog`), Workspace updates (`distribute.ts` with a JSON
deliveries ledger), ceremony agendas (`postAgendaToMatrix` with a ledger inside the agenda
snapshot, because `MatrixPostLog` requires a meeting), and Slack meeting notices
(`sendSlackNotification`, routed through the *user-keyed* `sendToAll` with the channel smuggled in
metadata, bound by `SlackChannelConfig`). A fifth — decisions to the leadership room — was the
request that made the pattern visible.

ADR-0045's pipeline cannot carry these. It is person-keyed by construction: a subject resolves
to recipients, each recipient's category × channel matrix decides, each channel sends to that
person's own account. A room post has no recipient set; its audience is a destination the
workspace chose. Forcing it through would give per-person preferences a meaning they do not have.

## Decision

1. **One primitive for content addressed to a place.** An *outbound post* is one `OutboundPost`
   row per `(kind, subject, event, destination)`: `pending` → `sent` | `failed` | `cancelled`,
   with attempts, a lease and the provider's event id. The ADR-0045 shape — emit → durable rows
   → deliver → cron sweep — without recipients.
2. **Producers emit; they never send.** `emitOutboundPost` resolves the destination and inserts
   the row. It is a database write, so a provider outage cannot fail the producing write. The
   request kicks delivery with `after()` (the `agentRuns/enqueue.ts` pattern: the service
   enqueues, the caller kicks); `process-notifications` sweeps `pending` and `failed` rows.
3. **One poster per provider.** `deliverOutboundPost` claims the row, re-resolves the
   destination (a binding switched Off since enqueue cancels the row), asks the producer to
   render `{ html, text, markdown }`, and dispatches on `ChannelLink.provider`. Matrix first,
   Slack next; adding a provider touches no producer, adding a producer touches no poster.
4. **Destinations are outbound `ChannelLink` rows with a `kind`.** Resolution is project →
   workspace per kind; `Off` is an inactive project row and hard-blocks; the unique is
   `(provider, externalId, direction, kind)` (D-0055). `SlackChannelConfig` converges onto this.
5. **A post is caused only by a person's act** (D-0056). Confirmation, approval, a status
   change by a human. Agent drafts and agent-actor status changes never post. Matrix has no
   un-send; the room should hear the outcome, not the proposal.
6. **Restricted projects fail closed.** No inherited workspace room; a restricted project posts
   only through its own explicit binding for the kind. The rule lives in resolution, so every
   producer gets it. (Meeting summaries keep their shipped behaviour until they migrate.)
7. **Idempotency is in the row.** The unique makes a double enqueue a no-op; the provider
   transaction id derives from `(postId, attempt)`, so a retry of a timed-out send is the same
   message.

## Considered alternatives

- **Reuse `emitNotification` with a pseudo-recipient.** Rejected: recipients, preferences and
  access filtering are per person; a room has none. It would corrupt the preference matrix and
  the access gate.
- **A fifth Matrix-named poster and a generalised `MatrixPostLog`.** Rejected: slightly less
  debt and still no primitive; Slack would have been a sixth copy.
- **Generalise `workspaceUpdates/distribute.ts`.** Closest existing shape, but its ledger is a
  JSON column on one row type, its channels are hard-coded and it has no kind or scope. Its
  lease-and-sweep pattern is reused; the rest is not.
- **Post synchronously inside the producing write.** Rejected: a provider timeout would fail or
  slow `confirmDraft`.
- **Post on draft creation by default.** Rejected: the only option that posts text no person
  has read. A labelled opt-in later, off by default.

## Consequences

- V1 touches none of the four existing posters. Each migrates in its own PR and deletes its
  ledger: meeting summaries (`MatrixPostLog` dropped), Workspace updates (`deliveries.matrix`),
  agendas (`Ceremony.matrixRoomId` becomes a `ChannelLink(kind: "agenda")`), Slack meeting
  notices (`SlackChannelConfig` → `ChannelLink(provider: "slack")`).
- Mentions are a poster concern: Matrix uses the gateway pairing MXIDs in
  `IntegrationUserMapping` (ADR-0043); Slack needs a mapping writer that does not exist yet and
  renders names until it does.
- `resolveMatrixDestination` and `resolveChannelLink` are now thin wrappers over, and a sibling
  of, `resolveOutboundDestination`; the inbound resolver filters on `direction: inbound` because
  the old compound unique no longer identifies a row.
