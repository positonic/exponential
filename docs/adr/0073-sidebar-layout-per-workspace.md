---
status: accepted
---

# The sidebar layout is customised per workspace, layered over a user-wide default

The sidebar is edited in place, Notion-style: right-click it, choose **Customize sidebar**, drag sections and items by their grip, show or hide them, pin **Shortcuts** at the top, add sections, press Done. We decided the result is stored **per (user, workspace)** in a new `WorkspaceNavLayout` row, layered over the existing user-wide `NavigationPreference.navLayout` that the settings page edits: a workspace with no row shows the user's default layout, and the first edit in a workspace forks it.

## Considered options

- **Keep one layout per user.** Rejected: the thing people want to arrange differently is the workspace. A client workspace needs CRM and Meetings up front; a personal one needs Pages and Goals. One layout forces the union.
- **One layout per workspace, shared by all its members.** Rejected: the sidebar is a personal tool, and letting one member rearrange another's navigation is a surprise, not a feature. Role-based defaults can come later as a seed, not as the storage.
- **Add `workspaceId` to `NavigationPreference`.** Rejected: that row also holds user-wide toggles (quote, suggested focus, gamification) and is keyed `userId @unique`; reshaping it would make every reader of those toggles workspace-aware for no gain. A separate table keyed `(userId, workspaceId)` keeps the fallback explicit.

## Consequences

- Shortcuts are a reserved section (`shortcuts`) in the same `NavSection[]` shape, rendered without a heading. Custom links carry their own `label` and `href` on the item; built-in items still key into `NAV_ITEM_CONFIG`.
- Merging a stored layout with the defaults now treats an item placed *anywhere* as present, so pinning or moving a built-in item no longer duplicates it in its default section.
- Default sections cannot be deleted (the merge would re-append them), only hidden; user-added sections and the shortcuts section can.
- The settings page keeps editing the user-wide default and says so.
