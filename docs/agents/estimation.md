# Estimation anchors

Reference tickets the `/estimate-points` skill scores this repo's Exponential
tickets against. They replace the skill's default anchors (which came from the
CLEAR product), so "a 3" here means a 3 of *this* codebase's work.

The rubric itself lives in the skill. This file only calibrates it. Change the
anchors here, deliberately, when a score feels wrong. Never recalibrate inside
one estimation run, or this week's points stop being comparable with last
week's.

All anchors are real tickets in product `exponential`, scored in the first
calibrated run (2026-10-29, 410 done tickets).

## Anchors

| Pts | Ticket | Why |
|---|---|---|
| 1 | #521 Delete the /api/test-projects-tool debug endpoint | deletion |
| 1 | #59 Wire "Share" CTA → copy deep link | one handler |
| 1 | #683 Mastra reschedule-actions tool sends the deprecated dueDate field | one-field fix |
| 2 | #682 Sidebar Today badge ignores scheduled-only actions | one query fix + test |
| 2 | #715 Disable Vercel preview deployments for PR branches | single config change |
| 2 | #634 Docs: Keyboard shortcuts and the command palette | one docs page |
| 3 | #725 Show linked Decisions on the feature detail page | one view over an existing relation |
| 3 | #689 Ticket.completedAt moves to now() on every save with a completed status | service fix, several cases, tests |
| 3 | #770 V2: Key results view on the Goals page | one new view |
| 5 | #726 Agent-created decisions start as drafts a human confirms | schema + router + UI |
| 5 | #698 Semantic search, Zoe and favourites leak pages the user can't view | access-control fix across several surfaces |
| 5 | #711 [mastra] V2b: Routing tools and prompt | cross-repo slice |
| 8 | #702 V1c: Agent run engine and the action page | new subsystem |
| 8 | #697 Share a Page with specific people (invite-only pages) | new access model end to end |
| 8 | #769 V1: Goals page merged into one list with Table, OKRs and Timeline views | page rebuild, three views |
| 13 | #254 Features V2: registry with Areas, Live/Deprecated lifecycle, EARS requirements, spec-page links | several new models + migration; should have been split |

## Reference distribution

First run: 1 ≈ 2% · 2 ≈ 16% · 3 ≈ 29% · 5 ≈ 39% · 8 ≈ 12% · 13 < 1%.
This product runs heavier than CLEAR because most tickets are multi-layer
vertical slices (schema + router + UI) and few are one-line fixes. A run over
similar work should land within a few points of each share.
