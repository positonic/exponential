# Weekly plan session state is server-backed and shared by the wizard and the chat walk

## Status

Accepted — 2026-06-10

## Context

The **Weekly plan** wizard (`/weekly-plan`) is a stateful, multi-step flow: `intro →
reviewing → complete`. Its state — `currentProjectIndex`, the `reviewedProjects` Set, a
`changes` Map tallying `statusChanges` / `priorityChanges` / `actionsAdded`, `reviewMode`, the
project snapshot — lives **entirely in React** in
`src/app/(sidemenu)/w/[workspaceSlug]/weekly-plan/page.tsx`. Only on finish does it call
`weeklyReview.markComplete`, which **upserts** one `weeklyReviewCompletion` row per
`(userId, workspaceId, week)` and bumps the streak.

We are adding a chat-driven Weekly plan where Zoe walks the user one Project per turn. The
requirement is explicit: a user must be able to **switch between the wizard and chat mid-
review with state preserved** — review three Projects in chat, open the wizard, resume at the
fourth. Conversational memory alone cannot satisfy this: the Mastra thread is not visible to
the React wizard, and a turn-reconstructed tally drifts over long, interrupted walks. A future
reader will wonder why review state — which looks like transient UI state — sits in the
database.

## Decision

**The in-progress Weekly plan is a single server-persisted session, keyed identically to its
completion record, that both surfaces read and write.**

1. **One persisted session per `(userId, workspaceId, week)`** holding position, the reviewed-
   Project set, the running change tally, `reviewMode`, and a project snapshot. This is the same
   key `weeklyReviewCompletion` already uses, so we **extend `weeklyReviewCompletion`** into a
   row created at *start* rather than introduce a parallel table: it already carries
   `reviewMode` and the tally fields; we add the in-progress fields and create the row when the
   review begins.

2. **The React wizard moves its state server-side.** `currentProjectIndex` /
   `reviewedProjects` / `changes` become reads/writes against the session, not React-only state.
   The chat walk is a second client of the same session.

3. **"Completed this week" means `completedAt != null`, not row existence.**
   `isCompletedThisWeek` (`weeklyReview.ts`) currently tests whether the row *exists*; once the
   row is created at start, that test would falsely report a just-started review as done. It
   must switch to checking `completedAt`. The upsert in `markComplete` already makes a chat
   completion and a wizard completion in the same week safe — they target the same row.

This is the [ADR-0006](0006-web-voice-shares-text-thread.md) pattern applied to the Weekly
plan: two surfaces, one shared persisted state, so switching surfaces is continuous rather
than a fresh start.

## Considered alternatives

- **Conversational-memory-only state.** Zoe reconstructs position and counts from the Mastra
  thread each turn; no new persistence. Rejected: invisible to the wizard (so no cross-surface
  resume — the hard requirement), and the tally drifts over interrupted walks.
- **Stateless, re-derive each turn** ("reviewed" = issues no longer present; tally = this-
  week's edits). Rejected: cannot represent "reviewed, deliberately no change" or a skip, and
  still doesn't share with the wizard.
- **A separate `WeeklyReviewSession` table alongside `weeklyReviewCompletion`.** Rejected: the
  two are 1:1 on the same key and the completion row already holds `reviewMode` + the tallies;
  a second table means a join and a sync rule between "the session" and "the completion" for no
  gain. Extending the existing row keeps one source of truth for the week.

## Consequences

- **A shipped feature is refactored, not just extended.** The wizard's state management moves
  from client to server; this carries regression risk on a live flow, concentrated on the
  `isCompletedThisWeek` semantic change and the streak. Both paths (wizard finish, chat finish)
  must land on the same upserted row.
- **Resume becomes a first-class affordance.** Both surfaces can show "you reviewed 5 of 12 —
  continue?", and the proactive nudge can resume an abandoned session rather than restart it.
- **The session is the tally's authority.** `markComplete` draws counts from the session, so
  the completion summary (status changes, actions added) is accurate regardless of which
  surface(s) the user moved through.
- **Week boundary is `getSundayWeekStart`.** Sessions inherit the existing week definition; an
  abandoned session does not roll over — a new week starts a new session.
