# Page-load baseline — 2026-09-16

Phase 1 of the app speed work: measure only, no code changes. Phase 2 fixes wait for approval of the list at the bottom.

## How this was measured

- **Build:** production `next build` of `main` at `0c5a20ab` (BUILD_ID `RZEonsKhRd-KWzevsD42H`), served by `next start`.
- **Harness:** `e2e/perf/` (Playwright, one worker, CDP network capture). Run it with `npm run test:perf`, then build the report with `npx tsx e2e/perf/report.ts <run-dir>`.
- **Data:** the `dev-fixture` workspace plus `scripts/seed-perf-fixture.ts`. That adds 1,500 actions, 43 projects, 1,600 contacts, 200 orgs, 120 deals, 300 tickets, 12 features and 100 meetings, plus one of each detail entity. It runs in an isolated pgvector Postgres with `pg_stat_statements`, so DB query counts are per load.
- **Per route:** 1 warm-up, then 3 hard loads (fresh context, cold cache) and 3 client navigations (from `/w/dev-fixture/home`, clicking the sidebar link when one exists, otherwise `router.push`). Every tRPC procedure was also replayed alone 3× server-side. All figures are medians.
- **"Ready"** means `<main>` saw no DOM mutation for 1s, no tRPC/RSC request was in flight, and no Mantine loader or skeleton was visible. The reported time is the last such activity.
- **Coverage:** 158 routes measured. 11 skipped: 6 are admin-only, and 5 had no seedable entity (team, video, WhatsApp config, ADR).

**Caveats:**
- **No added network latency.** Payload size and request chains cost far more in production than they do here.
- **Render-cost figures are inferred, not profiled.** They come from gaps between data arrival and ready. Every Phase 2 PR re-measures with the same harness.
- **Stream drain skews waterfall detection.** tRPC's stream link drains on the main thread, so during a long synchronous render a batch appears to "end" late. The `waitsOn` heuristic was checked against code for every waterfall claimed below.

Raw per-route JSON and the full 158-row table are in `e2e/.results/perf/baseline/` (gitignored).

## The floor: what every page pays

A near-empty page in the shell (`/privacy`, `/terms`) takes **~270–290ms** to ready. It makes 5 tRPC requests (14 procedures), loads **1.86 MB of tRPC JSON** and **1.33 MB of JS** (transferred), and runs 32 DB queries. TTFB is 9–14ms and LCP 44ms. The server is not the bottleneck: the `(sidemenu)` layout awaits only `auth()`, which decodes a JWT without touching the DB.

| Procedure (on 100% of pages) | Probe ms | Payload | Mounted by |
|---|---|---|---|
| `action.getAll` | 92 | **1,870,574 B** | `WorkspaceSwitcher.tsx:59`, `InboxCount.tsx:6`. Both only count inbox items |
| `action.getToday` | 9 | 7,805 B | `TodayCount.tsx:6`, which only uses `.length` |
| `workspace.list`, `portfolioReview.getCurrentWeekFocusIds` | 9, 6 | 4.6 KB | `WorkspaceSwitcher.tsx:52,54` |
| `assistant.getDefault`, `mastra.getMastraAgents`, **`aiInteraction.startConversation` (a POST write)** | 5, 5, – | – | `ManyChat.tsx:466,871,889`, mounted inside the **closed** `ZoeDrawer` (`ZoeDrawer.tsx:453`) |
| `navigationPreference.getPreferences`, `pluginConfig.getEnabled`, `favorite.list`, `timeEntry.getActive`, `notification.getScheduledNotifications` | 4–5 | tiny | `NavLinks.tsx:113,117`, `FavouritesNav.tsx:46`, `useActiveTimer.tsx:24`, `useNotificationChecker.tsx:31` |

Timeline of a floor hard load:
1. HTML paints at about 40ms.
2. JS evaluates and hydrates until about 140–165ms.
3. The first tRPC batch runs 110–160ms. `action.getAll` is 98% of its bytes and 92 of its ~100ms server time.
4. The ManyChat chunk (438 KB transferred) lazy-loads and fires its GET batch and the `startConversation` POST. **That POST is the end of the ready window in 8 of 12 floor runs.**

The floor's JS includes:
- ManyChat: 438 KB transferred, of which **303 KB is the full highlight.js**, pulled in via `MarkdownRenderer.tsx:4` → `@mantine/code-highlight`.
- Tiptap/ProseMirror: ~120 KB gzip, imported into the layout through the closed `GlobalAddTaskButton` modal (`Sidebar.tsx:83` → `GlobalAddTaskButton.tsx:8` → `ActionModalForm.tsx:9`).
- gtag: 176 KB.

## Slow pages, ranked

"Hard" = median hard-load ready (ms). "Nav" = median client-navigation ready (ms). Floor ≈ 280.

| # | Route | Hard | Nav | tRPC req / KB | DB q | Primary cause (verified) |
|---|---|---|---|---|---|---|
| — | `/welcome`, `/home`, `/onboarding` | 3177 | 3045 | 5 / 1861 | 36 | **Not a load problem.** The scripted welcome-chat animation holds the DOM busy ~3.0s (`WelcomeChatView.tsx:73,200,217`). `/home` only measured `/welcome` because the fixture user counts as new (`home/page.tsx:25`). The harness now ages the fixture account; a single run of the real `/home` (CommandCenter) came in at 711ms, not yet a median. |
| 1 | `/w/[ws]/meetings` | **2549** | **1517** | 4 / 2065 | 54 | Mantine `Tabs` keeps all 5 panels mounted, so the full card list renders **5×** (~505 cards instead of 101) (`MeetingsContent.tsx:938,1055`). Per-card Combobox + Menu portals (`MeetingCardList.tsx:373,431`). Page-context re-render after data (`MeetingsContent.tsx:372`). `getMeetingCards` is unpaginated and reads every full transcript (`transcription.ts:1394,1462`). |
| 2 | `/w/[ws]/actions` | **1863** | **1417** | 6 / 3170 | 45 | ViewBoard renders 696 unvirtualised kanban cards, each with closed `EditActionModal` + `AssignActionModal`: ~850–1000ms synchronous render (`ViewBoard.tsx:183,734`, `TaskCard.tsx:211`). `list.list`/`view.list` start only after the board commits, and their response re-renders every card: +320–410ms (`ViewBoard.tsx:402`, `TaskCard.tsx:115`). `view.getViewActions` ships `project: true` per row, 1.33 MB (`view.ts:484`). |
| 3 | `/w/[ws]` (workspace root) | **1668** | 136 | 4 / 3908 | 78 | `redirect()` to `/home` runs client-side because `GuestRouteGuard` renders nothing during SSR: +~1.16s on hard loads. Emails and agendas link here (`workspace.ts:661`, `generateAgenda.ts:58`). |
| 4 | `/w/[ws]/views` | **1623** | **1545** | 6 / 3170 | 45 | Same as #2. |
| 5 | `/meetings` | **1601** | 964 | 5 / 2068 | 53 | Same as #1. |
| 6 | `/w/[ws]/products/[p]/tickets` | **1032** | **910** | 7 / 2211 | 72 | The 306-row unvirtualised table renders twice: once from the layout's warm cache, again when prefs/cycles/epics land (~550–590ms of nav). Product layout `router.prefetch()`es all 8 tabs, downloading ~430 KB of sibling JS (`products/[p]/layout.tsx:112`), and warms 359 KB of other tabs' data (`layout.tsx:138-157`). `ticket.list` overfetches body/links/tags (`ticket.ts:240`). |
| 7 | `/plan` | **1025** | 690 | 6 / 4595 | 142 | Hidden "Projects" tab panel mounts, rewrites the URL to `?status=ACTIVE,ON_HOLD`, and fetches `project.getAll(include actions)` twice at 1.37 MB each (`plan/page.tsx:44`, `useProjectViewState.ts:310`): ~300–380ms. `note.getByDate` ×12 (`StartupRoutineForm.tsx:114`). Key mismatches duplicate `getToday`/`goal.getAllMyGoals`/`okr.getAll` (`TodayOverview.tsx:54,62`, `CreateProjectModal.tsx:99`). |
| 8 | `/w/[ws]/workspace` | **963** | 695 | 7 / 4515 | 119 | Same as #7, plus a skeleton gate on `day.getByDate` and `calendar.getConnectionStatus` before any page query starts (`workspace/page.tsx:24-35`). |
| 9 | `/w/[ws]/projects` | **911** | **620** | 6 / 4460 | 65 | `project.getAll({include:{actions:true}})` returns full 52-column Action rows when the table needs 4 fields: 1.12 MB could be ~110 KB (`project.ts:136`, `WorkspaceProjectsConceptD.tsx:509`). The default status filter is applied by `router.replace` after mount, so the list fetches twice (`useProjectViewState.ts:270`). 100–270ms post-data render, cause unprofiled. |
| 10 | `/w/[ws]/products/[p]/graph` | 826 | 564 | 6 / 2209 | 63 | ~310ms of xyflow + dagre render after data (`DependencyGraphCanvas.tsx:112,297`), plus the product layout costs from #6. |
| 11 | `/w/[ws]/products/[p]/epics` | 734 | **932** | 8 / 2212 | 75 | Legacy redirect to `/tickets`, plus #6. |
| 12 | `/projects` | 666 | 420 | 6 / 4502 | 74 | Same as #9. |
| 13 | `/actions` | 639 | 336 | 5 / 1906 | 49 | ~564 unvirtualised `ActionRow`s from the cached floor `action.getAll`, re-rendered when `list.list` lands (`ActionsList.tsx:82,258`). |
| 14 | `/w/[ws]/products/[p]` (+ insights, decisions, research, problems, retros) | 562–626 | 340–417 | 7–8 / 2210 | 70–76 | Page body mounts ~250–300ms after the product layout on both hard load and nav (a Suspense reveal hold is suspected, mechanism unconfirmed). Product queries wait on a client `getBySlug` (`layout.tsx:79`). `favorite.isFavorite` waits on it too (`layout.tsx:260`). `insight.list` warm key differs from the page key (`layout.tsx:152` vs `insights/page.tsx:289`). |
| 15 | `/w/[ws]/projects/[slug]` (+ `/projects/[slug]`, project-details) | 495–531 | 230–252 | 7 / 2011 | **129–139** | All tab panels stay mounted, firing ~20 hidden-panel procedures and ~100 DB queries (`ProjectContent.tsx:361,400`). `getById` is fetched twice under slug vs cuid keys (`ProjectContent.tsx:125` vs `ProjectMembersPanel.tsx:45`). No server prefetch. |
| 16 | `/w/[ws]/home` | 504 | 471 | 4 / 3908 | 77 | `YourWorkPanel` fetches `action.getAll({workspaceId})` (1.87 MB) to show 8 rows (`YourWorkPanel.tsx:74`). `getMeetingCards` is unlimited (160 KB) to show 5 (`YourWorkPanel.tsx:94`). |
| 17 | `/w/[ws]/weekly-plan` | 457 | 179 | 5 / **5615** | 51 | `project.getActiveWithDetails` copies the full Project row into every action, 1.94 MB (`project.ts:634`). `action.getAll({workspaceId})` (1.87 MB) is fetched only to count inbox items (`weekly-plan/page.tsx:116`). |
| 18 | `/w/[ws]/weekly-team-checkin` | 495 | 260 | 5 / 3773 | 43 | Same `getActiveWithDetails` payload. |
| 19 | `/w/[ws]/projects-tasks` | 408 | 193 | 5 / 3973 | 61 | `getProjectsWithActions` ×2 (restore-filter double fetch). It always returns unused `noProjectActions`, 22% of the payload (`project.ts:719`). |
| 20 | `/today`, `/act` | 408–424 | 135–185 | 6 / 1863 | 50 | `getSchedulingSuggestions` waits on the 1.87 MB `action.getAll`, then fires twice, unscoped then scoped (`TodayDesktopShell.tsx:107,124`). |
| 21 | `/w/[ws]/crm/pipeline` | 370 | 126 | 6 / 1997 | 47 | `pipeline.list` → `getDeals`/`getStats` waterfall: +70–90ms hard. `getDeals` repeats the stage row per deal (`pipeline/page.tsx:44,91`, `pipeline.ts:411`). |
| 22 | `/w/[ws]/okr-checkin` | 326 | 58 | 4 / 1861 | 55 | `okr.getAll` ×14, one per period card, only for `.length` (`PeriodSelector.tsx:157`). |

Everything else (~120 routes) is within ~100ms of the floor. Its cost is the floor.

### Other findings from the run

- **Security (separate task filed):** `day.getByDate` includes `notes: true` with no user filter, and `Day` rows are shared across users. Every signed-in user receives every user's notes for that date; `/days/[date]` serializes them into the page (`dayService.ts:86`, `days/[date]/page.tsx:13-18`).
- `project.getAll` runs an unscoped `project.count()` and logs every project id/name on every call (`project.ts:98-106,173-194`).
- **Broken links found by Link prefetch (404):** `/w/[ws]/ceremonies`, `/okrs`, `/w/[ws]/habits`, `/w/[ws]/wheel-of-life`. `/simli` returns 500. `/features` throws 3 page errors. `/days/[date]` and `/startup-routine` hit intermittent React error 418 hydration mismatches.
- **Harness gaps (fixed in the harness PR):**
  - `/home` needed a non-new fixture user.
  - `/docs/[...slug]` was fed a project slug.
  - Pages linking to the 404s above hit the ready timeout on an in-flight prefetch; a 4xx/5xx response now counts as settled.

## Proposed Phase 2 PRs (for approval)

Shared costs go first, because each one moves every page. Each PR ships before/after medians from this harness. A fix that doesn't measure a win is dropped, not merged.

**Shared / cross-cutting**

| PR | Root cause | Expected effect | Behaviour notes |
|---|---|---|---|
| S1 | Sidebar downloads full `action.getAll` / `getToday` to show counts | −1.87 MB and ~80ms server time on **every** page load | Add a count procedure and invalidate it at the same mutation sites (56 `action.getAll` cache touch-points). Pages that relied on the warm floor cache (`/actions`, `/today`) will fetch their own copy; re-measure them. |
| S2 | ManyChat mounted inside the closed ZoeDrawer | −438 KB JS, −1 GET batch and −1 DB write (`startConversation`) per page view; floor ready ~290 → ~260ms locally | Mount on first open and keep mounted after (voice/state behaviour preserved); preload the chunk on FAB hover / ⌘J. |
| S3 | Full highlight.js statically in `MarkdownRenderer` | −303 KB on every page that renders Markdown (and via S2 the floor) | Load `CodeHighlight` only when a fenced code block renders; same markup once loaded. |
| S4 | Closed modals' bodies statically imported by layout (Tiptap via GlobalAddTaskButton, BugReport, CommandPalette body) | ~−120 KB gzip Tiptap from every page | `next/dynamic` modal bodies, preload on trigger hover / shortcut. |
| S5 | `SessionProvider` gets no initial session → client `/api/auth/session` round trip each load | −1 request (and 1 serverless invocation) per page view | Pass the `auth()` session already computed in `Layout.tsx` (react `cache` dedupes it; no DB). |
| S6 | Off-`/w` routes: `getDefault` → `getBySlug` → sidebar queries client waterfall | −2 round trips before the sidebar settles on `/today`, `/settings/*`, … | Seed `getBySlug` from `getDefault` result. |

**Page-specific, in ranked order**

| PR | Root cause | Pages | Expected effect |
|---|---|---|---|
| P1 | Hidden tab panels mount eagerly (Mantine `keepMounted` default) | meetings (5× list), `/plan` + `/w/[ws]/workspace` (Projects panel refetch + URL rewrite), project detail (~20 procedures, ~100 DB q) | Meetings: up to ~700ms. Plan/workspace: ~300–380ms and −2.6 MB. Project detail: −13–15 procedures. Mount a panel on first activation, then keep it mounted (state retention unchanged after first visit). |
| P2 | Per-card closed modals across 696 kanban cards | `/w/[ws]/actions`, `/views` | Largest render cost in the app (~850–1000ms). Step 1 is one shared/lazy modal; windowing needs UX sign-off, so it is not included. |
| P3 | ViewBoard's `list.list` / `view.list` gated behind board commit → second full render | `/w/[ws]/actions`, `/views` | ~320–410ms |
| P4 | `/w/[ws]` redirect runs client-side | workspace root (email/agenda links) | ~−1.1s hard load |
| P5 | Projects list: default status applied via `router.replace` after mount → duplicate fetch | `/w/[ws]/projects`, `/projects`, projects-tasks, timeline | −1.37 MB wasted fetch per bare-URL load |
| P6 | `project.getAll(include actions)` ships full Action rows | projects lists (and plan/workspace if P1 doesn't land) | −~1 MB per call |
| P7 | Product layout prefetches all tabs' JS + warms 359 KB of other tabs' data | every product page | −430 KB JS and −350 KB tRPC per product page; investigate the ~300ms body-mount hold alongside it |
| P8 | Backlog table double render | product tickets | ~275–300ms, profile first |
| P9 | Overfetching list procedures, one PR each: `view.getViewActions` project row, `getActiveWithDetails` project copy, `ticket.list` columns, `getMeetingCards` limit + transcript column, `getProjectsWithActions` unused `noProjectActions`, `YourWorkPanel` and weekly-plan counts via full `action.getAll` | actions/views, weekly-plan/checkin, product tabs, meetings/home, projects-tasks, workspace home | −0.2 to −1.9 MB per affected page |
| P10 | Small client waterfalls: today/act scheduling suggestions, action-detail `tag.list`, CRM pipeline `getDeals`, goal-detail prefetch, product `isFavorite`, project-detail `getById` key mismatch, `okr.getAll` ×14, `note.getByDate` ×12 | as listed | 10–90ms each locally, +1 RTT each in production |

**Out of scope or not recommended:**
- `/welcome`'s 3s is intended animation.
- GA `lazyOnload` needs an analytics owner's sign-off.
- Link-prefetch trimming: no measured effect yet.
- Row virtualisation needs a UX decision.
