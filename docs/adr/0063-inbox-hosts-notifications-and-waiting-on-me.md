# The Inbox hosts notifications and "Waiting on me" beside unsorted actions

## Status

Accepted — 2026-09-30. Builds the in-app notification inbox that
[ADR-0045](0045-unified-notification-dispatch.md) deferred.

## Context

ADR-0045 persisted every Notification with a `readAt` column but left the in-app inbox as its own,
later feature. Until now the only reader was the home page, which showed unread **mentions** only;
assignments, due dates, meeting and agenda notifications were written and never shown. Nothing listed
what was blocked on the user either — decisions they own, drafts from their meetings, QA tickets to
promote — except per-workspace home panels. Meanwhile `/inbox`, the first item in the sidebar, held
only unsorted actions (the Today partition's `inbox` bucket, [ADR-0034](0034-todays-actions-shared-partition.md)).

The obvious alternative was a separate notifications page (a bell) next to the action inbox. We
rejected it: two "clear your queue" surfaces compete for the same daily habit, and the sidebar
already sends people to `/inbox`.

## Decision

1. `/inbox` becomes three tabs, each cleared its own way: **Notifications** (read them; unread by
   default, all categories), **Waiting on me** (act on them), **Actions** (the unchanged unsorted
   list). Notifications is the default tab; the tab lives in `?tab=`.
2. The word "inbox" keeps its ADR-0034 meaning — the unsorted-actions bucket — in voice, the Today
   partition and the docs. The page hosts the other two tabs beside it.
3. The sidebar Inbox badge counts **unread notifications + Waiting on me** (things that need you).
   The unsorted-actions count moves to the Actions tab and now counts exactly what it lists (no
   project, due date or schedule), where it previously counted every project-less action.
4. "My recent activity" is **not** a tab: a history never clears. It is the **Mine** filter on the
   activity feeds.

## Consequences

- The badge number changes meaning for existing users; the help page says so.
- Waiting on me is cross-workspace, so each kind carries its own access rule (the decision resolver
  gains `buildDecisionAccessWhereAcrossWorkspaces`; tickets require workspace membership).
- Its overdue section follows the Today partition exactly, including legacy rows whose kanban status
  is done while `status` is still `ACTIVE` — the same set `/today` shows.
