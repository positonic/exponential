# Actions Layer Extraction — Implementation Plan

**Date:** 2026-04-27
**Owner:** james
**Status:** Approved structure; ready for `/plan-to-beads`

## Overview

Extract a shared "actions list" layer composed by both `ActionList.tsx` (the original, used in 6 places) and `TodayView.tsx` (the new /today redesign), so the redesigned visual style works everywhere `ActionList` is used today **without losing** any of `ActionList`'s existing functionality. Replaces three parallel row renderers (ActionList inline, TodayView inline, `ActionItem.tsx`) with one, four `PRIORITY_ORDER` duplicates with one, and five mode-specific bulk toolbars with one declarative toolbar.

End result: one canonical `<ActionsList>` component with the redesigned visual, fed by shared utility/hook/component layer in `src/lib/actions/` and `src/app/_components/actions/`. All 6 callers migrated. Legacy `ActionList.tsx`, `TodayView.tsx`, `TodayView.css`, `ActionItem.tsx` deleted.

## Current State Analysis

**Two parallel implementations exist:**

- [src/app/_components/ActionList.tsx](src/app/_components/ActionList.tsx) — 1425 lines, props-driven, used by 6 callers, full feature set: ACTIVE/COMPLETED toggle, Notion sync indicators, per-row Assign menu, Lists submenu, tag badges, assignee avatar groups, "From [Creator]" hover card, deep-link `getById` fallback, priority sort, 5 bulk-edit modes (overdue/project/focus/inbox/all), AI scheduling suggestions inline per-row, multi-cache optimistic updates.
- [src/app/_components/today/TodayView.tsx](src/app/_components/today/TodayView.tsx) — 1278 lines, self-fetching, only used on /today, redesigned visual: circular priority-tinted checkboxes, hash-based project color palette, inline ReschedulePopover, ZoePanel for AI suggestions, sticky TimelineRail with calendar events + scheduled actions + live now-line, completion animation, detailed-actions feature flag routing, `bulkReschedule`/`bulkDelete` via dedicated tRPC endpoints, `markProcessedOverdue` integration.
- [src/app/_components/today/TodayView.css](src/app/_components/today/TodayView.css) — 840 lines of scoped CSS, BEM-ish naming, zero hardcoded hex (already compliant), local `--pri-*` and `--today-proj-{0..4}` tokens that should be promoted to globals.

**Critical functionality gaps in TodayView vs ActionList** (must NOT regress):
1. ACTIVE/COMPLETED toggle + completedAt-desc sort
2. Per-row Assign menu → AssignActionModal
3. SyncStatusIndicator (Notion sync state, deleted-remotely warnings)
4. TagBadgeList on row
5. Assignee Avatar.Group + "From [Creator]" hover card
6. Deep-link fallback via `api.action.getById` when `?action=<id>` not in current list
7. Priority sort (10-tier with stable id tiebreaker)
8. Lists submenu (toggle add/remove from workspace lists)
9. Per-row scheduled-time duration tooltip
10. Multi-cache optimistic update (getAll + getToday) routed by viewName

**Latent bug:** [TodayOverview.tsx:420](src/app/_components/TodayOverview.tsx#L420) passes `enableBulkEditForOverdue={true}` without handlers — bulk-edit button appears but does nothing.

**Type duplication:** `Priority` exists in both [src/types/action.ts](src/types/action.ts) and [src/types/priority.ts](src/types/priority.ts) (server uses the latter; `Someday Maybe` only in `priority.ts`). `PRIORITY_ORDER` duplicated in 4 files: [ActionList.tsx:75](src/app/_components/ActionList.tsx#L75), [useProjectViewState.ts:15](src/app/_components/projects/useProjectViewState.ts#L15), [useProjectSort.ts:12](src/app/_components/toolbar/useProjectSort.ts#L12), [NextActionCapture.tsx:28](src/app/(sidemenu)/w/[workspaceSlug]/weekly-review/_components/NextActionCapture.tsx#L28).

**Test coverage:** Essentially zero for these components. Only [GoogleCalendarConnect.test.tsx](src/app/_components/tests/GoogleCalendarConnect.test.tsx) exists as a component test. No tests for `bulkReschedule`, `bulkDelete`, `getToday`, `getById`, `markProcessedOverdue`. Backfilling these router integration tests is high-leverage during the refactor.

## Desired End State

**Code organization:**
```
src/lib/actions/
├── priority.ts             # Priority type, PRIORITY_ORDER, sortByPriority, toVisualPriority, priorityClass
├── projectColor.ts         # projectColorIndexFor + PROJECT_PALETTE_SIZE
├── syncStatus.ts           # getSyncStatus
├── dates.ts                # formatDate, formatScheduledTime, formatClockTime, formatAprDay, hourFloat, formatHourLabel, formatHourMinute12, addDays, nextSaturday
└── types.ts                # Canonical Action, SimpleAction (derived from RouterOutputs)

src/app/_components/actions/
├── components/
│   ├── ActionRow.tsx + ActionRow.module.css
│   ├── PriorityCheckbox.tsx
│   ├── ProjectChip.tsx
│   ├── SyncStatusIndicator.tsx
│   ├── RowAssignees.tsx
│   ├── RowCreatorBadge.tsx
│   ├── RowActionsMenu.tsx              # Edit / Assign / Lists submenu
│   ├── ReschedulePopover.tsx + ReschedulePopover.module.css
│   ├── BulkEditToolbar.tsx + BulkEditToolbar.module.css
│   ├── ZoePanel.tsx + ZoePanel.module.css
│   └── TimelineRail.tsx + TimelineRail.module.css
├── hooks/
│   ├── useActionMutations.ts          # update with viewName-routed invalidation
│   ├── useBulkActionMutations.ts      # bulkReschedule + bulkDelete + bulkAssignProject + markProcessedOverdue
│   ├── useBulkSelection.ts            # generic Set<string> state machine
│   └── useActionPartition.ts          # overdue / today / upcoming / inbox split
├── ActionsList.tsx                     # the shell that composes everything
└── TodayLayout.tsx                     # composes ActionsList + TimelineRail + ZoePanel
```

**Verification of end state:**
- `grep -rn "from ['\"].*ActionList['\"]" src/` returns zero hits (other than internal re-exports during transition phases)
- `grep -rn "PRIORITY_ORDER" src/` returns one definition (in `src/lib/actions/priority.ts`) plus imports
- `grep -rn "from ['\"].*ActionItem['\"]" src/` returns zero hits
- All 6 caller files import from `~/app/_components/actions/ActionsList`
- `npm run check` passes
- `npm run build` passes
- `npm run test` and `npm run test:integration` pass
- Manual: every caller page renders correctly with the new visual; /today has all features ActionList had (Assign menu, Sync indicator, Lists submenu, Tag badges, Completed Today section, deep-link fallback)

### Key Discoveries

- ALL 6 callers manage selection internally; the external `selectedActionIds`/`onSelectionChange` path in [ActionList.tsx:660-676](src/app/_components/ActionList.tsx#L660-L676) is dead code — safe to drop in the new API.
- Bulk-edit modes are mutually exclusive across callers: overdue→Actions/TodayActions, project→Actions, focus→Actions, inbox→Actions, all→ViewBoard. A declarative `bulkActions={[…]}` config is a clean replacement.
- True universal API (passed by all 6 callers) is just `viewName` and `actions`. Everything else is per-caller.
- TodayView's Icon SVG component ([TodayView.tsx:120-153](src/app/_components/today/TodayView.tsx#L120-L153)) duplicates Tabler — drop the inline SVGs and standardize on `@tabler/icons-react`.
- TodayView's `ReschedulePopover` partially overlaps `UnifiedDatePicker`'s `mode="bulk"` ([UnifiedDatePicker.tsx](src/app/_components/UnifiedDatePicker.tsx)). Consolidating in Phase 2.
- Existing `ActionItem.tsx` already exports canonical `Action`/`SimpleAction` types ([ActionItem.tsx:11-30](src/app/_components/ActionItem.tsx#L11-L30)) — fold these into `src/lib/actions/types.ts`.
- Pre-commit hook ([.husky/pre-commit:21-51](.husky/pre-commit)) checks hex only (not rgba), and treats `.module.css` identically to `.css`. CSS Modules require no allowlist additions.
- TodayView.css already uses tokens correctly; no hex literals. Promoting `--pri-*`/`--actions-proj-*` to globals is a clean lift.
- `useDayRollover`, `useActionDeepLink`, `useDetailedActionsEnabled` already extracted — keep in `src/hooks/`, do not move.

## What We're NOT Doing

- **Not** introducing new tRPC procedures (use existing `update`, `bulkReschedule`, `bulkDelete`, `bulkAssignProject`, `markProcessedOverdue`).
- **Not** building component tests for the full `<ActionsList>` or `<ActionRow>` (no harness exists for tRPC + dnd-kit + Mantine modal flows; ROI poor; manual verification + router integration tests instead).
- **Not** migrating CSS off Tailwind for components that are mostly utility classes — CSS Modules used only where complex (animations, pseudo-elements, grid layouts, popover positioning).
- **Not** adding Playwright/E2E coverage in this refactor (out of scope; existing test infra is Vitest only).
- **Not** changing the tRPC router contracts (only adding tests against them).
- **Not** redesigning the Edit/Create action modals — they remain as-is and are composed by `<ActionsList>`.
- **Not** building a feature-flag rollout — co-existence period is at the code level (both components ship to all users), with caller-by-caller migration in PRs.
- **Not** addressing kanban view (`<KanbanBoard>`) — it stays separate; the refactor is list-only.
- **Not** consolidating Mantine `<EditActionModal>` / `<AssignActionModal>` / `<CreateActionModal>` styling.
- **Not** changing the `?actionId=` URL contract.

## Implementation Approach

Foundation-first, then composites, then shell, then incremental migration. Each phase leaves the app in a working state. Phases 1–5 are zero-behavior-change (both old components keep working, just internally reshaped). Phase 6 ships the redesign to /today with full feature parity. Phase 7 migrates the other 5 callers one at a time. Phase 8 deletes dead code. Phase 9 backfills router tests.

CSS strategy: Tailwind utility classes for the simple bits, colocated `.module.css` for complex visual logic (animations, pseudo-elements, popover positioning, rail timeline). Tokens promoted into `globals.css`; rgba() literals migrated to `color-mix()` against tokens.

Cache invalidation: `useActionMutations(context)` accepts a `viewName`/`projectId` context and routes invalidations the same way ActionList does today (transcription → `getByTranscription`, today → `getToday`, project → `getProjectActions`, else → `getAll` + always `scoring.*`).

---

## Phase 1: Foundation — pure utilities, canonical types, design tokens

### Overview
Move all duplicated pure logic into one place. Unify the `Priority` type. Promote local CSS tokens to globals. Zero user-visible change.

### Changes Required

#### 1. Canonical priority module
**File**: `src/lib/actions/priority.ts` (new)
- Export `Priority` type from `~/types/priority` (single source of truth)
- Export `PRIORITY_ORDER: Record<Priority, number>` (10 priorities + `Someday Maybe`)
- Export `sortByPriority(a, b)` (stable id tiebreaker)
- Export `VisualPriority = "urgent" | "high" | "normal" | "low"` (4-bucket collapse)
- Export `toVisualPriority(priority, isOverdue)` (lifted from [TodayView.tsx:56-63](src/app/_components/today/TodayView.tsx#L56-L63))
- Export `priorityCheckboxBorderVar(priority)` returning the `var(--mantine-color-*-filled)` string (lifted from [ActionList.tsx:783-795](src/app/_components/ActionList.tsx#L783-L795))

#### 2. Unify Priority type
**File**: `src/types/action.ts`
- Remove duplicate `Priority`/`ActionPriority`/`PRIORITY_OPTIONS` definitions
- Re-export from `~/types/priority` (or remove exports and update consumers)

**Files to update** (replace inline `PRIORITY_ORDER`/`sortByPriority` with imports):
- `src/app/_components/ActionList.tsx:75-86` → import from `~/lib/actions/priority`
- `src/app/_components/projects/useProjectViewState.ts:15` → import
- `src/app/_components/toolbar/useProjectSort.ts:12` → import
- `src/app/(sidemenu)/w/[workspaceSlug]/weekly-review/_components/NextActionCapture.tsx:28` → import
- `src/app/_components/today/TodayView.tsx` → use `toVisualPriority` from import

#### 3. Project color utilities
**File**: `src/lib/actions/projectColor.ts` (new)
- Export `PROJECT_PALETTE_SIZE = 10`
- Export `projectColorIndexFor(projectId)` (lifted from [TodayView.tsx:45-54](src/app/_components/today/TodayView.tsx#L45-L54))

#### 4. Sync status utility
**File**: `src/lib/actions/syncStatus.ts` (new)
- Export `getSyncStatus(action)` returning `{ status, provider, externalId?, syncedAt? }` (lifted from [ActionList.tsx:43-72](src/app/_components/ActionList.tsx#L43-L72))

#### 5. Date formatters
**File**: `src/lib/actions/dates.ts` (new)
- `formatDate`, `formatScheduledTime` (from ActionList)
- `formatClockTime`, `formatAprDay`, `hourFloat`, `formatHourLabel`, `formatHourMinute12`, `addDays`, `nextSaturday` (from TodayView)

#### 6. Canonical Action types
**File**: `src/lib/actions/types.ts` (new)
- Export `Action` (rich, includes optional syncs/lists/epic/tags/createdBy — superset compatible with `getAll`/`getById`/`getProjectActions`/`getByTranscription`)
- Export `SimpleAction` (slim, compatible with `getToday`)
- Document with comments which router queries match each shape
- Migrate `ActionItem.tsx`'s type definitions; `ActionItem.tsx` updated to import from here (deleted later in Phase 8)

#### 7. Promote design tokens
**File**: `src/styles/globals.css`
- Add `--pri-urgent`, `--pri-high`, `--pri-normal`, `--pri-low` to both `:root` light block and `[data-mantine-color-scheme="dark"]` / `.dark` blocks (resolved from existing `--accent-*`/`--brand-*`/`--color-text-muted`)
- Add `--actions-proj-{0..4}` (renamed from local `--today-proj-{0..4}`) globally; keep `--today-proj-{0..4}` as aliases for backwards compat through Phase 6

**File**: `src/app/_components/today/TodayView.css`
- Remove local definitions of the promoted tokens (lines 9-21)
- Migrate rgba() literals to `color-mix()` against tokens (lines 110, 120, 317, 395-402, 562, 571-622, 635, 683, 808, 814, 820)
- Update `--today-proj-*` references to `--actions-proj-*`

### Success Criteria

#### Automated Verification:
- [ ] `npm run check` passes (lint + typecheck)
- [ ] `npm run test` passes
- [ ] `npm run test:integration` passes
- [ ] `grep -rn "PRIORITY_ORDER" src/ | grep -v "import\|src/lib/actions/priority"` returns zero (only one definition + imports)
- [ ] No new files outside `src/lib/actions/` and `src/styles/globals.css` and `src/styles/...` and the listed update sites
- [ ] Pre-commit hook passes (no hex introduced)

#### Manual Verification:
- [ ] /today renders identically (visual diff: nothing changed)
- [ ] /actions, /inbox, project pages render identically
- [ ] Priority sort order unchanged on all pages
- [ ] Light and dark mode both unchanged

**Implementation Note:** Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Leaf presentation components

### Overview
Extract every UI primitive that has a single responsibility. Each component standalone, used by the existing ActionList and TodayView (still otherwise unchanged). No behavior change.

### Changes Required

#### 1. SyncStatusIndicator
**File**: `src/app/_components/actions/components/SyncStatusIndicator.tsx` (new)
- Props: `{ action: Action }`
- Lifted from [ActionList.tsx:89-144](src/app/_components/ActionList.tsx#L89-L144)
- Uses `getSyncStatus` from `~/lib/actions/syncStatus`

#### 2. RowAssignees
**File**: `src/app/_components/actions/components/RowAssignees.tsx` (new)
- Props: `{ assignees: Action["assignees"] }`
- Lifted from [ActionList.tsx:903-983](src/app/_components/ActionList.tsx#L903-L983)
- Includes Avatar.Group, HoverCard tooltips, max 2 + overflow "+N"

#### 3. RowCreatorBadge
**File**: `src/app/_components/actions/components/RowCreatorBadge.tsx` (new)
- Props: `{ createdBy: Action["createdBy"], currentUserId?: string }`
- Lifted from [ActionList.tsx:859-900](src/app/_components/ActionList.tsx#L859-L900)
- Returns `null` when `createdById === currentUserId`

#### 4. PriorityCheckbox
**File**: `src/app/_components/actions/components/PriorityCheckbox.tsx` (new)
- Props: `{ priority, status, onToggle, disabled?, visual?: "circular" | "checkbox" }`
- Two visual modes: `"circular"` (TodayView style with `.module.css`) and `"checkbox"` (ActionList Mantine style as transitional fallback — though we'll converge on circular by Phase 5)
- Uses `toVisualPriority` and `priorityCheckboxBorderVar` from `~/lib/actions/priority`

#### 5. ProjectChip
**File**: `src/app/_components/actions/components/ProjectChip.tsx` (new)
- Props: `{ projectId: string | null, projectName: string }`
- Hash-based palette via `projectColorIndexFor`
- Module CSS for `--actions-proj-{0..9}` color-mix tinting (lifted from [TodayView.css:377-392](src/app/_components/today/TodayView.css#L377-L392))

#### 6. ReschedulePopover
**File**: `src/app/_components/actions/components/ReschedulePopover.tsx` + `ReschedulePopover.module.css` (new)
- Props: `{ onChoose: (choice: RescheduleChoice) => void }`
- Lifted from [TodayView.tsx:159-278](src/app/_components/today/TodayView.tsx#L159-L278)
- Quick options + month calendar
- Replaces `UnifiedDatePicker`'s `mode="bulk"` usage in bulk toolbars (UnifiedDatePicker stays for single-row picker use cases elsewhere)

#### 7. RowActionsMenu
**File**: `src/app/_components/actions/components/RowActionsMenu.tsx` (new)
- Props: `{ action: Action, workspaceLists, onEdit, onAssign, onListToggle }`
- Edit / Assign / Lists submenu (lifted from [ActionList.tsx:989-1041](src/app/_components/ActionList.tsx#L989-L1041))

#### 8. Wire into existing components
- ActionList imports `SyncStatusIndicator`, `RowAssignees`, `RowCreatorBadge`, `RowActionsMenu` from new location; deletes inline JSX
- TodayView imports `ReschedulePopover`, `ProjectChip` from new location; deletes inline JSX
- Both still otherwise unchanged

### Success Criteria

#### Automated Verification:
- [ ] `npm run check` passes
- [ ] `npm run test` passes
- [ ] `npm run test:integration` passes
- [ ] All new files exist at the listed paths
- [ ] `grep -c "function SyncStatusIndicator\|const SyncStatusIndicator" src/app/_components/ActionList.tsx` returns 0
- [ ] No hex colors introduced (pre-commit passes)

#### Manual Verification:
- [ ] /today: ReschedulePopover quick options and calendar work; project chips show correct colors
- [ ] /actions: SyncStatusIndicator shows Notion icons; assignee avatars + hover cards work; "From [creator]" badge appears
- [ ] All Lists submenu actions work (toggle on/off)
- [ ] Assign menu opens AssignActionModal correctly

**Implementation Note:** Pause here for manual confirmation.

---

## Phase 3: State hooks

### Overview
Replace inline state machines with reusable hooks. Both ActionList and TodayView refactored internally to use them. No behavior change.

### Changes Required

#### 1. useActionMutations
**File**: `src/app/_components/actions/hooks/useActionMutations.ts` (new)
- Signature: `useActionMutations(context: { viewName: string; projectId?: string })`
- Returns: `{ updateAction, isUpdating }`
- Wraps `api.action.update.useMutation` with:
  - Optimistic update on both `getAll` and `getToday` caches (per [ActionList.tsx:281-345](src/app/_components/ActionList.tsx#L281-L345))
  - viewName-routed invalidation: `transcription-actions` → `getByTranscription`; `today` → `getToday`; `projectId` present → `getProjectActions`; else → `getAll`
  - Always invalidate `scoring.getTodayScore` and `scoring.getProductivityStats`
  - Auto-syncs `kanbanStatus` to DONE/TODO when action belongs to a project and status changes
  - Toast notifications via `@mantine/notifications` (per TodayView pattern)

#### 2. useBulkActionMutations
**File**: `src/app/_components/actions/hooks/useBulkActionMutations.ts` (new)
- Signature: `useBulkActionMutations(context: { viewName: string; projectId?: string })`
- Returns: `{ bulkReschedule, bulkDelete, bulkAssignProject, isMutating }`
- Wraps `api.action.bulkReschedule`, `api.action.bulkDelete`, `api.action.bulkAssignProject`
- Calls `dailyPlan.markProcessedOverdue` after overdue bulk operations (per [TodayView.tsx:910,936](src/app/_components/today/TodayView.tsx#L910))
- Optimistic update on `getAll` cache
- Toast notifications on success/failure

#### 3. useBulkSelection
**File**: `src/app/_components/actions/hooks/useBulkSelection.ts` (new)
- Signature: `useBulkSelection<T extends { id: string }>(items: T[])`
- Returns: `{ selected: Set<string>, isSelected, toggle, selectAll, selectNone, clear, count, selectedItems }`
- Replaces 5 copies in ActionList ([226-238](src/app/_components/ActionList.tsx#L226-L238) etc.) and 2 copies in TodayView ([587-593](src/app/_components/today/TodayView.tsx#L587-L593))

#### 4. useActionPartition
**File**: `src/app/_components/actions/hooks/useActionPartition.ts` (new)
- Signature: `useActionPartition(actions: Action[], today: Date, viewName: string)`
- Returns: `{ overdue, todays, upcoming, inbox, completed }`
- Replaces inline `useMemo` in [TodayView.tsx:627-669](src/app/_components/today/TodayView.tsx#L627-L669) and inline filter logic in [ActionList.tsx:407-478](src/app/_components/ActionList.tsx#L407-L478)
- Applies priority sort to active partitions; completedAt-desc to completed

#### 5. Wire into existing components
- ActionList: replace inline `updateAction` mutation with `useActionMutations({ viewName })`; replace 5 bulk-selection state machines with `useBulkSelection` instances; replace inline filter logic with `useActionPartition`
- TodayView: same — `useActionMutations({ viewName: "today" })`, `useBulkActionMutations({ viewName: "today" })`, two `useBulkSelection` instances, `useActionPartition`
- Both should shrink by ~300-500 lines each

### Success Criteria

#### Automated Verification:
- [ ] `npm run check` passes
- [ ] `npm run test` passes
- [ ] `npm run test:integration` passes
- [ ] ActionList.tsx line count under 1000 (was 1425)
- [ ] TodayView.tsx line count under 900 (was 1278)
- [ ] All new hook files exist; each exports the named hook

#### Manual Verification:
- [ ] /today: completing an action updates score widget; reschedule still works; bulk overdue reschedule still triggers daily-plan badge
- [ ] /actions: completing in a project updates kanban order; deep-link `?action=<id>` opens modal; lists submenu still works
- [ ] All 5 bulk-edit modes (overdue/project/focus/inbox/all) still work end-to-end on their respective pages
- [ ] No console errors; no double mutations

**Implementation Note:** Pause here for manual confirmation. This phase is the riskiest of phases 1-5 because it changes mutation/cache logic.

---

## Phase 4: Unified `<ActionRow>` and declarative `<BulkEditToolbar>`

### Overview
Build the two big composite pieces. Don't wire them to anything yet — they ship dormant alongside ActionList/TodayView. Add hook-level unit tests.

### Changes Required

#### 1. ActionRow
**File**: `src/app/_components/actions/components/ActionRow.tsx` + `ActionRow.module.css` (new)
- Props: `{ action: Action, isOverdue?: boolean, bulkMode?: boolean, bulkSelected?: boolean, onBulkToggle?, onComplete, onReschedule, onOpen, onAssign, onListToggle, suggestionProposal?: string, currentUserId?: string }`
- Single visual: TodayView style (circular priority-tinted checkbox, hash-based project chip, inline ReschedulePopover trigger, RowActionsMenu)
- Composes: `PriorityCheckbox` (circular), `HTMLContent`, `ProjectChip`, `SyncStatusIndicator`, `RowAssignees`, `RowCreatorBadge`, `TagBadgeList`, `RowActionsMenu`, `ReschedulePopover`
- Includes completion animation (350ms/600ms staged, lifted from [TodayView.tsx:807-819](src/app/_components/today/TodayView.tsx#L807))
- Module CSS handles row layout grid, hover state, completion `@keyframes`, popover positioning

#### 2. BulkEditToolbar
**File**: `src/app/_components/actions/components/BulkEditToolbar.tsx` + `BulkEditToolbar.module.css` (new)
- Props: `{ selection: ReturnType<typeof useBulkSelection>, allItems: Action[], actions: BulkActionDef[], workspaceProjects?: { id, name }[] }`
- `BulkActionDef` discriminated union:
  ```ts
  type BulkActionDef =
    | { kind: "reschedule"; onReschedule: (date: Date | null, ids: string[]) => void }
    | { kind: "delete"; onDelete: (ids: string[]) => void; confirmMessage?: (count: number) => string }
    | { kind: "assignProject"; onAssign: (projectId: string, ids: string[]) => Promise<void> };
  ```
- Renders: Select All / Select None buttons, count badge, then one button per `actions[]` entry
- Reschedule button uses `<ReschedulePopover>`; AssignProject uses Mantine `<Select>` + Move button; Delete shows `window.confirm`
- Replaces 5 separate toolbar JSX blocks ([ActionList.tsx:1209-1385](src/app/_components/ActionList.tsx#L1209-L1385)) and 2 in TodayView

#### 3. Hook unit tests
**File**: `src/app/_components/actions/hooks/__tests__/useBulkSelection.test.ts` (new)
- Tests: initial empty state, toggle add/remove, selectAll, selectNone, clear, count derivation
- Pattern: `renderHook` from `@testing-library/react` (per [GoogleCalendarConnect.test.tsx](src/app/_components/tests/GoogleCalendarConnect.test.tsx))

**File**: `src/app/_components/actions/hooks/__tests__/useActionMutations.test.ts` (new)
- Tests: viewName routing logic (verify which `utils.*.invalidate` is called for each viewName); kanban auto-sync logic
- Pattern: mock `api` calls via `vi.mock` and assert invocations
- Skip optimistic update tests (too coupled to React Query internals)

### Success Criteria

#### Automated Verification:
- [ ] `npm run check` passes
- [ ] `npm run test` passes (including new hook unit tests)
- [ ] `npm run test:integration` passes
- [ ] `<ActionRow>` and `<BulkEditToolbar>` files exist
- [ ] Hook tests cover the listed cases

#### Manual Verification:
- [ ] N/A — components dormant, no production usage yet

**Implementation Note:** Move directly to Phase 5; nothing user-visible to verify.

---

## Phase 5: New `<ActionsList>` shell

### Overview
The drop-in replacement for `ActionList` lands but isn't adopted by any caller yet. Old `ActionList.tsx` still exists and untouched.

### Changes Required

#### 1. ActionsList shell
**File**: `src/app/_components/actions/ActionsList.tsx` (new)
- Props (new declarative API):
  ```ts
  interface ActionsListProps {
    viewName: string;
    actions: Action[];
    isLoading?: boolean;
    showProject?: boolean;
    showCheckboxes?: boolean;       // legacy compat — controls visibility of bulk-select column
    bulkActions?: BulkActionDef[];  // declarative replacement for 5 enable*+on* pairs
    completedSection?: "hidden" | "collapsed" | "expanded";  // default "hidden" except /today which uses "collapsed"
    schedulingSuggestions?: Map<string, SchedulingSuggestionData>;
    schedulingSuggestionsLoading?: boolean;
    onApplySchedulingSuggestion?: (actionId, date, time) => void;
    onDismissSchedulingSuggestion?: (actionId) => void;
    deepLinkActionId?: string | null;
    onActionOpen?: (id: string) => void;
    onActionClose?: () => void;
    onTagClick?: (tagId: string) => void;
  }
  ```
- Composes: section headers (Overdue collapsible w/ count badge, Active, Completed Today collapsible), `<ActionRow>` per action, `<BulkEditToolbar>` when `bulkActions` provided
- Uses: `useActionMutations`, `useBulkActionMutations`, `useBulkSelection`, `useActionPartition`, `useActionDeepLink` (with `getById` fallback per [ActionList.tsx:243-269](src/app/_components/ActionList.tsx#L243-L269))
- Renders `<EditActionModal>` and `<AssignActionModal>` (composed, not pulled into row)
- Empty states: `<InboxZeroCelebration>` for inbox+ACTIVE; `<EmptyState>` for other empty cases
- Sticks to the new visual style (circular checkboxes, project chips); old Mantine `<Paper>`/`<Accordion>` row layout dropped

### Success Criteria

#### Automated Verification:
- [ ] `npm run check` passes
- [ ] `npm run test` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run build` passes (Vercel build dry run; checks treeshake doesn't pull dead exports)
- [ ] `src/app/_components/actions/ActionsList.tsx` exists and exports `ActionsList`

#### Manual Verification:
- [ ] N/A — not yet wired into any page

---

## Phase 6: TodayLayout — migrate /today, restore lost features

### Overview
First user-visible phase. Build the composition wrapper and ship the redesign with full feature parity. Restore everything missing from current TodayView.

### Changes Required

#### 1. TimelineRail (extract)
**File**: `src/app/_components/actions/components/TimelineRail.tsx` + `TimelineRail.module.css` (new)
- Props: `{ dayLabel, eventsCount, focusCount, blocks, range, now }`
- Lifted from [TodayView.tsx:506-560](src/app/_components/today/TodayView.tsx#L506-L560)
- Module CSS lifts the rail-specific rules from TodayView.css (lines 691-840)

#### 2. ZoePanel (extract)
**File**: `src/app/_components/actions/components/ZoePanel.tsx` + `ZoePanel.module.css` (new)
- Props: `{ suggestions, actionsById, onAcceptAll, onAccept, onDismissAll, onDismissOne }`
- Lifted from [TodayView.tsx:418-491](src/app/_components/today/TodayView.tsx#L418-L491)
- Module CSS lifts Zoe-specific rules from TodayView.css (lines 567-685)

#### 3. TodayLayout composer
**File**: `src/app/_components/actions/TodayLayout.tsx` (new)
- Owns: `api.action.getAll`, `api.calendar.getTodayEvents`, `api.scheduling.getSchedulingSuggestions` queries
- Owns: ZoePanel state (`dismissedSuggestions`, `zoeOpen`), reschedule suggestion handlers
- Computes: rail blocks (calendar events + scheduled actions), `now`, `dayLabel`
- Renders: two-column grid with `<ActionsList completedSection="collapsed" bulkActions={[reschedule, delete]} ...>` on left, `<TimelineRail>` on right; `<ZoePanel>` above the list when suggestions exist
- Replaces `TodayView.tsx`

#### 4. Replace TodayView usage
**File**: `src/app/_components/DoPageContent.tsx`
- Line 226: replace `<TodayView tagIds={selectedTagIds} />` with `<TodayLayout tagIds={selectedTagIds} />` (or keep `TodayView` as a thin re-export of `TodayLayout` for one phase)

#### 5. Fix TodayOverview latent bug
**File**: `src/app/_components/TodayOverview.tsx`
- Line 420: pass actual handlers OR remove `enableBulkEditForOverdue={true}` (recommend: remove — TodayOverview is a glanceable card, no bulk editing needed)

#### 6. Restore missing features on /today (verified via ActionsList composition)
- ACTIVE/COMPLETED → Completed Today collapsible section (via `completedSection="collapsed"`)
- Per-row Assign menu → AssignActionModal (via `RowActionsMenu`)
- SyncStatusIndicator on rows
- TagBadgeList on rows (via ActionRow composition)
- Assignee Avatar.Group + "From [Creator]" hover card
- Deep-link fallback via `getById` (via `useActionDeepLink` + ActionsList internal handling)
- Priority sort (via `useActionPartition`)
- Lists submenu (via `RowActionsMenu`)
- Per-row scheduled-time duration tooltip (via ActionRow)

### Success Criteria

#### Automated Verification:
- [ ] `npm run check` passes
- [ ] `npm run test` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run build` passes
- [ ] `grep -c "TodayView\|TodayLayout" src/app/_components/DoPageContent.tsx` shows the new wiring
- [ ] No hex colors introduced

#### Manual Verification:
- [ ] /today renders with new visual + timeline rail + Zoe panel intact
- [ ] **Completed Today section** appears below Active when collapsed, expands on click
- [ ] **Assign menu** on row dots → AssignActionModal opens, can add/remove assignees, persists
- [ ] **Sync indicator** shows for Notion-synced actions; deleted-remotely tasks show red badge
- [ ] **Tag badges** appear on rows; clicking a tag filters by it (if `onTagClick` wired)
- [ ] **"From [Creator]" badge** appears for tasks created by another user; hover card shows
- [ ] **Assignee avatars** appear; hover shows full info
- [ ] **Deep link** `/today?action=<id>` opens the EditActionModal even if action is not in today's bucket
- [ ] **Priority sort** verifiable: 1st Priority above 2nd, etc., within both Overdue and Active sections
- [ ] **Lists submenu** in row dots: toggling on/off persists
- [ ] **Scheduled time duration tooltip** appears on hover of time chip
- [ ] All previously working features still work: bulk overdue reschedule, bulk overdue delete, ZoePanel accept-all/dismiss, calendar rail accuracy, live now-line tick, completion animation
- [ ] TodayOverview card no longer shows broken bulk-edit button

**Implementation Note:** Highest-risk single phase. Pause here for thorough manual confirmation before proceeding.

---

## Phase 7: Migrate remaining 5 callers

### Overview
Each caller is its own beads issue, its own PR-sized change. Order by risk (lowest first). ActionList still works for un-migrated callers throughout.

### Phase 7a: recording/[id]/page.tsx
**File**: `src/app/(sidemenu)/recording/[id]/page.tsx`
- Line 31: `import { ActionList }` → `import { ActionsList }`
- Line 629: `<ActionList viewName="transcription-actions" actions={transcriptActions} showCheckboxes={false} showProject />` → `<ActionsList viewName="transcription-actions" actions={transcriptActions} showCheckboxes={false} showProject />`
- No bulk actions, no deep-link → simplest migration
- **Manual:** open a recording detail page; verify actions render with new visual; clicking a row opens edit modal

### Phase 7b: OneOnOneBoard.tsx
**File**: `src/app/_components/OneOnOneBoard.tsx`
- Line 8: import swap
- Line 279: `<ActionList actions={project.actions} viewName={\`project-${project.id}\`} showCheckboxes={false} enableBulkEditForOverdue={false} />` → `<ActionsList actions={project.actions} viewName={\`project-${project.id}\`} showCheckboxes={false} />` (drop the redundant `enableBulkEditForOverdue={false}`)
- **Manual:** open Weekly Review board; expand a project row; verify actions render

### Phase 7c: TodayOverview.tsx
**File**: `src/app/_components/TodayOverview.tsx`
- Line 21: import swap
- Line 420: `<ActionList viewName="today" actions={actions} showCheckboxes={false} enableBulkEditForOverdue={true} />` → `<ActionsList viewName="today" actions={actions} showCheckboxes={false} />` (drop the broken bulk flag fixed in Phase 6 already)
- **Manual:** /today-overview card renders; no broken bulk button; clicking actions opens modal

### Phase 7d: TodayActions.tsx
**File**: `src/app/_components/TodayActions.tsx`
- Line 4: import swap
- Lines 97-103: map old props to new declarative API:
  ```tsx
  <ActionsList
    viewName="today"
    actions={todayActions.data ?? []}
    bulkActions={[
      { kind: "reschedule", onReschedule: (date, ids) => handleOverdueBulkReschedule(date, ids) },
      { kind: "delete", onDelete: (ids) => handleOverdueBulkAction("delete", ids) },
    ]}
  />
  ```
- **Manual:** any page using `<TodayActions>`; bulk overdue reschedule/delete works

### Phase 7e: ViewBoard.tsx
**File**: `src/app/_components/views/ViewBoard.tsx`
- Line 35: import swap
- Lines 742-755: map to:
  ```tsx
  <ActionsList
    viewName="actions"
    actions={(actions ?? []) as Action[]}
    showProject
    bulkActions={[
      { kind: "reschedule", onReschedule: handleBulkReschedule },
      { kind: "delete", onDelete: handleBulkDelete },
      { kind: "assignProject", onAssign: handleBulkAssignProject },
    ]}
    isLoading={isLoading}
    deepLinkActionId={deepLinkActionId}
    onActionOpen={onActionOpen}
    onActionClose={onActionClose}
    onTagClick={handleTagClick}
  />
  ```
- **Manual:** /views/[id] in list mode; bulk delete + reschedule + assign-project all work; deep-link works; tag click filters

### Phase 7f: Actions.tsx (largest)
**File**: `src/app/_components/Actions.tsx`
- Line 4: import swap
- Lines 1098-1126: map per-viewName: when `projectId` → assignProject + delete; when focus view → reschedule + delete; when inbox → schedule + delete + assignProject; otherwise → reschedule + delete (overdue)
- Construct `bulkActions` array conditionally:
  ```tsx
  const bulkActions = useMemo(() => {
    const list: BulkActionDef[] = [];
    if (projectId) {
      list.push({ kind: "assignProject", onAssign: handleProjectBulkAssignProject });
      list.push({ kind: "delete", onDelete: handleProjectBulkDelete });
    } else if (isFocusView(viewName)) {
      list.push({ kind: "reschedule", onReschedule: handleFocusBulkReschedule });
      list.push({ kind: "delete", onDelete: handleFocusBulkDelete });
    } else if (viewName.toLowerCase() === "inbox") {
      list.push({ kind: "reschedule", onReschedule: handleInboxBulkSchedule });
      list.push({ kind: "assignProject", onAssign: handleInboxBulkAssignProject });
      list.push({ kind: "delete", onDelete: (ids) => void handleInboxBulkDelete(ids) });
    }
    // Overdue handlers always available
    list.push({ kind: "reschedule", onReschedule: handleOverdueBulkReschedule });
    return list;
  }, [projectId, viewName, /* handlers */]);
  ```
- **Manual:** /actions, /inbox, /tomorrow, /upcoming, project pages — every bulk mode that worked before still works

### Success Criteria (Phase 7 overall)

#### Automated Verification:
- [ ] `npm run check` passes after each migration
- [ ] `npm run test` and `npm run test:integration` pass after each
- [ ] `grep -rn "import.*ActionList[^s]" src/app` returns zero (only `ActionsList` imports remain) — wildcards: `[^s]` to exclude the new name
- [ ] `npm run build` passes after final caller

#### Manual Verification:
- [ ] Each caller's manual checklist (above) verified before moving to the next

---

## Phase 8: Delete dead code

### Overview
Remove the legacy components once all 6 callers are on `ActionsList`.

### Changes Required
- Delete `src/app/_components/ActionList.tsx`
- Delete `src/app/_components/today/TodayView.tsx`
- Delete `src/app/_components/today/TodayView.css`
- Delete `src/app/_components/ActionItem.tsx`
- Remove `--today-proj-{0..4}` aliases from `globals.css` (introduced as backwards compat in Phase 1)
- Remove any duplicate priority/sort/dates/syncStatus exports left over

### Success Criteria

#### Automated Verification:
- [ ] `npm run check` passes
- [ ] `npm run test` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run build` passes
- [ ] `grep -rn "ActionList\b" src/` returns zero (excluding the new `ActionsList`)
- [ ] `grep -rn "TodayView" src/` returns zero
- [ ] `grep -rn "ActionItem" src/` returns zero
- [ ] Bundle size reduced (verify with `ls -la .next/static/chunks/` post-build)

#### Manual Verification:
- [ ] All 6 caller pages render correctly one final time
- [ ] /today, /actions, /inbox, /tomorrow, /upcoming, /views/[id], /recording/[id], /weekly-review (1:1s) all work end-to-end

---

## Phase 9: Router test backfill

### Overview
Pin the contract the new shared layer depends on. Independent of phases 6-8 (could run in parallel).

### Changes Required

#### 1. Action router integration tests
**File**: `src/server/api/routers/__tests__/action.integration.test.ts` (extend existing file)
- `bulkReschedule`: happy path, partial-success across actions belonging to different projects, permission scoping (only updates actions the user can edit), assignee/creator access paths
- `bulkDelete`: happy path, returns count, permission scoping, soft-delete semantics
- `bulkAssignProject`: happy path, kanban reset, cross-workspace propagation, FORBIDDEN on inaccessible target project
- `getToday`: date-window correctness (boundaries), assignee inclusion, DELETED exclusion, contract shape
- `getById`: auth path, response shape including nested relations (snapshot-style assertion)
- `update` field coverage extension: `priority`, `dueDate`, `projectId` reassignment (cross-workspace FORBIDDEN), `kanbanStatus`/`kanbanOrder` reorder

#### 2. DailyPlan router test
**File**: `src/server/api/routers/__tests__/dailyPlan.integration.test.ts` (new)
- `markProcessedOverdue`: happy path + score-recalc side effect (the known-fragile path at [dailyPlan.ts:241](src/server/api/routers/dailyPlan.ts#L241))

#### 3. Test factories
**File**: `src/test/factories/index.ts` (extend)
- Add `createTag({ workspaceId, name?, color? })`
- Add `createList({ workspaceId, name?, listType? })`
- Add `addActionToList({ listId, actionId })`

#### 4. Pin getAll contract
**File**: `src/server/api/routers/__tests__/action.integration.test.ts`
- Add a snapshot-style test asserting nested shape: `tags[0].id/name/color`, `assignees[0].user.id/name`, `project.id/name/slug`, `lists[0].listId`, `syncs[0].provider/status`

### Success Criteria

#### Automated Verification:
- [ ] `npm run test:integration` passes (~8-12 new test cases pass)
- [ ] New factory exports usable from test files
- [ ] Coverage: every router procedure called from `useActionMutations` and `useBulkActionMutations` has at least one test

#### Manual Verification:
- [ ] N/A — pure test work

---

## Testing Strategy

### Unit Tests (Vitest, happy-dom)
- `useBulkSelection` — initial state, toggle, selectAll, selectNone, clear, derived count
- `useActionMutations` — viewName routing logic (mock `api`, assert correct `utils.*.invalidate` calls); kanban auto-sync logic
- (Future) `priority.ts` exports — `sortByPriority` stability, `toVisualPriority` mapping

### Integration Tests (Vitest, Testcontainers Postgres)
- `action.bulkReschedule` / `bulkDelete` / `bulkAssignProject` — end-to-end with real DB
- `action.getToday` / `getById` — contract + permission paths
- `action.update` — extended field coverage
- `dailyPlan.markProcessedOverdue` — happy path + score recalc

### Manual Testing Steps
1. **/today** end-to-end: complete a task; reschedule via popover; bulk-overdue-reschedule; bulk-overdue-delete; verify Completed Today section; click row → modal opens; deep-link `?action=<id>` works for any action; ZoePanel accept-all → all suggestions applied
2. **Each ActionList caller** (recording, OneOnOne, TodayOverview, TodayActions, ViewBoard, Actions): visit page, verify rows render with new visual, complete action, exercise any bulk modes available
3. **Light/dark theme toggle** on /today and /actions: no hex regression visible
4. **Mobile/responsive** at <1180px: TimelineRail collapses to single column (per existing `@media` rule)

## Performance Considerations

- `useActionPartition` runs over the full actions array; current ActionList processes ~500-2000 actions per page. Memoize on `[actions, today, viewName]` (already pattern in TodayView). No new perf concern vs. status quo.
- `useActionMutations` adds one extra cache invalidation (`scoring.getProductivityStats`) on /today (TodayView didn't have it). Negligible.
- ActionRow's completion animation uses `setTimeout` × 2 per row click — same as TodayView today.
- Bundle size: net reduction expected from deleting ActionList.tsx (1425 lines), TodayView.tsx (1278), TodayView.css (840), ActionItem.tsx vs. adding ~10 new component files (each <200 lines). Estimate: -2000 LOC.
- TimelineRail's `setInterval(60_000)` for now-line ticking is unchanged.

## Migration Notes

- Co-existence period (Phases 5-7): both `<ActionList>` and `<ActionsList>` ship. Two row visuals visible across the app simultaneously, depending on which page. This is acceptable for the migration window (~1 week).
- All 6 caller migrations are independent and can land in any order within Phase 7. Recommended order is by risk (lowest first).
- No database migrations.
- No URL/route changes.
- No env var changes.
- The `?action=<id>` deep-link contract is preserved.
- Beads sync at end of each phase per project's session-close protocol.

## References

- Audit: feature-by-feature comparison of ActionList vs TodayView (in conversation history above)
- Caller research: 6 caller usage patterns + `enableBulkEditForOverdue` latent bug in TodayOverview
- CSS architecture research: hybrid Tailwind + CSS Modules, token promotion strategy
- Test coverage research: zero existing component tests; high-leverage router test backfill targets
- Type/utility research: 4× `PRIORITY_ORDER` duplicates, parallel `Priority` types, existing `useActionDeepLink` / `useDayRollover` / `useDetailedActionsEnabled` to keep
- TodayView introduction commit: `c9c9ebec025b5d244e09344dd245f16c0d965758` ("redesign /today with Classic + rail layout", 2026-04-21)
- Pre-commit hook: [.husky/pre-commit:21-51](.husky/pre-commit) — checks hex only; CSS Modules treated identically to plain CSS
- Styling guidance: [dev-docs/styling-architecture.md](dev-docs/styling-architecture.md)
