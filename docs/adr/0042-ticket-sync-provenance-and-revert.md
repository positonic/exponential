# Ticket sync provenance survives disconnect; revert is hard-delete of created tickets

## Status

Accepted — 2026-07-15

## Context

On 2026-07-14 a wrong Notion database was connected to a Product's ticket sync and pulled: 99 foreign tickets landed in the backlog with live statuses polluting every board. Cleanup hit three walls. Disconnecting the sync hard-deleted the `TicketSyncConfig` and cascaded away the `TicketSync` links and `TicketSyncRun` history — the only authoritative record of what the sync created — so recovery relied on forensic reconstruction that only worked because the tickets were hours old and untouched. Run records were written but surfaced nowhere. And no bulk undo existed; cleanup meant 99 single hard-delete calls from a shell loop.

## Decision

- **Soft disconnect.** Disconnect is a state change on `TicketSyncConfig`, never a row delete. "Disconnected" *means* `integrationId IS NULL` — no separate status column. The integration FK is nullable with `onDelete: SetNull`, so deleting the `Integration` row is itself a disconnect, never a purge. Three connection states fall out of existing fields: connected+enabled, connected+paused (`enabled: false`), disconnected (`integrationId: null`, `enabled` meaningless). Reconnect revives the same `[productId, provider]` row (new integration link, possibly a new database), keeping one product's sync history in one place.
- **Run-scoped, creation-only revert.** Revert takes a set of run ids and hard-deletes the tickets those runs *created* (`items[action === "created"]`), never `adopted` (the sync didn't create them) and never `updated` (pre-sync values aren't kept; revert is not a time machine). Connection-wide revert is a UI selection of all eligible runs, not a second mechanism.
- **Local-work guardrail, no override.** A ticket is skipped (never deleted) on *any* human-touch signal — comments, linked Actions, PR url/branch name, assignee, feature/epic/scope/cycle linkage, dependencies, or synced-field drift vs the link snapshot. No bulk force-override exists; skipped tickets are reported with reasons and handled individually. Skipped survivors get their `TicketSync` link tombstoned (`tombstonedAt`): they stop syncing but keep their provenance.
- **Revert is part of the ledger.** A revert writes its own `TicketSyncRun` (`direction: "revert"`) with the same per-item outcome shape (`deleted | skipped` + reason). A run is revertible at most once: "reverted" is stamped on the run (`revertedAt`, `revertedByRunId`), never derived by scanning later runs. Runs carry `triggeredById` (nullable — cron/agent runs have no acting user).
- **First-sync gate is UI-only.** On a never-pulled connection, "Sync now" runs a dry run first and shows a preview (database name, would-create count, sample titles) requiring explicit confirm. Deliberately not server-enforced: programmatic callers stay ungated — the safety net is revert, and the remote database can change between dry run and real run anyway.
- **Feed altitude: one event per happening.** A sync run posts a single `synced` activity event (counts in metadata, entity type `ticket_sync_run`); a revert posts a single `reverted` event. Per-ticket `created` events are suppressed on the engine path only. The durable forensic trail is the surviving provenance rows, not the feed (same altitude rule as ADR-0023). Ticket authorship is unchanged per ADR-0016: `createdById` stays the connection creator; run-level events attribute to `triggeredById`.

## Considered alternatives

- **Archive-as-revert (soft delete).** Rejected — an archived sync ticket keeps its Notion page id, so a later sync would re-adopt it and overwrite `ARCHIVED` from Notion (status is a synced field): zombie resurrection. Safety comes from the guardrail and preview, not soft deletion.
- **Separate connection status column.** Rejected — the null integration link already *is* the disconnected state; a parallel column can drift from it.
- **Force-override on the guardrail.** Rejected — over-skipping is cheap (single-ticket delete exists), under-skipping is irreversible.
- **Server-enforced first-sync dry-run handshake.** Rejected as ceremony — see First-sync gate above.
- **Deriving "reverted" by scanning later runs' items.** Rejected — a stamped fact is cheap and unambiguous; scanning makes eligibility O(history) and racy.

## Consequences

- One migration carries the whole feature: nullable `integrationId` (+ `SetNull`), `triggeredById`, `revertedAt`, `revertedByRunId`. Later slices (history UI, revert, gate, feed altitude) are migration-free.
- Callers can no longer assume `TicketSyncConfig.integrationId` is present — the sync engine path, adapter construction, and settings UI must treat a null link as the disconnected state.
- `updated` tickets remain unrecoverable by design; the UI must never imply otherwise.
- Glossary: *Ticket sync connection*, *Sync run*, *Sync revert* in CONTEXT.md.
