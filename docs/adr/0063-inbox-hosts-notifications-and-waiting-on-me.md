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
3. The sidebar Inbox badge counts **unread notifications + Waiting on me** (things that need you),
   less **summaries**: those are persisted for every subscriber daily and read by email or push, so
   counting them would give the badge a floor it never clears. They still show on the Notifications
   tab. The "N draft decisions to review" notification is marked read as soon as its meeting has no
   drafts left, so it doesn't outlive its Waiting-on-me twin. The unsorted-actions count moves to
   the Actions tab and now counts exactly what it lists (no project, due date or schedule), where it
   previously counted every project-less action.
4. "My recent activity" is **not** a tab: a history never clears. It is the **Mine** filter on the
   activity feeds.

## Consequences

- The badge number changes meaning for existing users; the help page says so.
- Waiting on me is cross-workspace, so each kind carries its own access rule (the decision resolver
  gains `buildDecisionAccessWhereAcrossWorkspaces`; tickets require workspace membership).
- Its overdue section is the Today partition's overdue set (`myOverdueActionsWhere`, on the viewer's
  local midnight), including legacy rows whose kanban status is done while `status` is still
  `ACTIVE` — the same set `/today` shows. The list is that WHERE's result sorted with the partition's
  `compareOverdue`, never re-bucketed (bucketing reads the server's timezone). The workspace home's
  "Needs your attention" card still uses its older due-date-only rule that skips those legacy rows,
  so the two can differ for a user with legacy data; converging them is a follow-up. Current board
  moves derive `COMPLETED` from kanban `DONE`, so no new such rows appear.
- Known overlap: a due-date reminder and the same action turning overdue can both count for a while;
  the reminder clears when read, the overdue item when the action is rescheduled or done.
- The cross-workspace decision count has no index on `Decision.ownerId`; fine at current scale, and
  `@@index([ownerId, status])` is a follow-up migration (through `develop`).
