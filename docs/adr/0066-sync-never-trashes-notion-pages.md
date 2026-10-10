# Syncs never trash Notion pages

## Status

Accepted — 2026-10-08. Supersedes the "archive ↔ archive" clause of
[ADR-0046](0046-ticket-sync-push-phase.md).

## Context

ADR-0046 made archive symmetric: a trashed Notion page archives its ticket, and an ARCHIVED ticket
trashes its Notion page. The second half assumed the archived ticket owns the page it is linked
to. That assumption broke in production.

On 2026-09-14 the CLEAR Backlog page "Website: visual design" was written by hand for CLEAR-612.
Inbound sync cannot recognise a hand-written page as an existing ticket's, so it imported the page
as a new ticket, CLEAR-616, and linked the page to it. On 2026-09-17 CLEAR-616 was archived as a
duplicate, and the push trashed the page — the only Notion copy of the work — along with its
sibling, CLEAR-617's scroll-prototypes page. Nothing in Exponential showed that the "duplicate"
was the ticket holding the Notion link.

The legacy action sync had a wider version of the same hazard: "overwrite mode" trashed every page
in the configured database that was not linked to one of the pushing user's actions, which includes
every page anyone else wrote there.

## Decision

Nothing Exponential does trashes a Notion page.

- **Ticket push:** ARCHIVED is an ordinary status. It is written to a Notion status option that maps
  to ARCHIVED; with no such option it is skipped with a warning, like any unmapped status. The sync
  link stays live.
- **Action sync overwrite mode:** it still forces local values onto pages it is linked to, but
  never trashes unlinked pages.
- **The trash call is gone.** `NotionService.archivePage` and the adapter methods that wrapped it
  are deleted, so reintroducing page trashing means writing it again on purpose.

Inbound is unchanged: a page someone trashes in Notion still archives its ticket. That direction
only changes Exponential state, which is recoverable.

## Considered options

- **Trash only pages the push created** (`TicketSync.remoteCreatedAt` set). Rejected: it would
  have saved this page, but it keeps a destructive write into the customer's workspace whose
  safety rests on one provenance column staying correct.
- **Unlink on archive** (tombstone the link, leave the page). Rejected: inbound treats a tombstoned
  link whose page is live as "restored from trash" and un-archives the ticket on the next edit.

## Consequences

- An archived ticket's Notion page stays in the database. Teams that want it hidden map a Notion
  status (e.g. "Archived", "Won't do") to ARCHIVED and filter it out of their views.
- Links tombstoned by the old outbound archive stay tombstoned and are still skipped by the push.
- The duplicate-import gap that led to this incident is still open, tracked separately: inbound
  should link a page that names an existing ticket (e.g. `CLEAR-612`) instead of creating one.
