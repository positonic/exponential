# A Ceremony is a definition entity; an Occurrence bridges the Scheduled meeting and the recorded Meeting

## Status

Accepted — 2026-09-09

## Context

Exponential has two meeting models that never meet. `TranscriptionSession` is the recorded
conversation (the user-facing **Meeting**: transcript, summary, participants, extracted Actions).
The Prisma model named `Meeting` is the forward-looking **Scheduled meeting** (a calendar booking
written to real calendars by iCalendar invite). The glossary records the naming wart and a decision
of 2026-08-16 to defer "unifying the two entities into one lifecycle" to its own design session.

Meanwhile the app has grown two *bespoke* recurring-meeting models: `OkrCheckin` (one row per team
per week, a facilitator, a PREPARING → IN_PROGRESS → COMPLETED lifecycle, per-person updates and
typed agenda items) and `Retrospective` (cycle-scoped, went-well / went-poorly / action items).
Pre-meeting scaffolding exists but is dormant: `PreMeetingBrief` has no writer, and the
"Meeting Preparation" workflow template has step definitions but no executors. The glossary said a
**Ritual** "is a kind of Meeting — not a separate entity", and "meeting type" was never stored, so
the Rituals tab on the Meetings page was dropped for having nothing to show.

The CLEAR workspace's operating-rhythm document defines six recurring meetings with purpose,
format, inputs and outputs, and records that the standup drifts into hour-long prioritisation,
the retrospective is postponed, and unresolved topics are revisited without action. Nothing in the
app can represent "what this recording is an instance of", let alone run before the meeting.

## Decision

1. **Ceremony is a definition entity**, owned by the workspace with an *optional* product, team
   or project scope (the `Retrospective` precedent, not a product-parented one). _Amended
   2026-09-27:_ the project scope is a set, not a single id — `CeremonyProject` links a ceremony
   to any number of projects (a review ceremony walks several), and a project to any number of
   ceremonies; the former `Ceremony.projectId` was backfilled into the join table. It carries name,
   title aliases, purpose, a "not for" list, cadence rule (RRULE), duration, owner, participant
   set, agenda template, inputs, outputs and an optional Matrix room.
2. **Occurrence is the instance.** One row per cadence tick, generated for a rolling window,
   unique per ceremony and scheduled start. Lifecycle: planned → agenda circulated → in progress →
   captured → followed through, with a side exit to *skipped* (with reason). It snapshots the
   definition it was created under and stores its generated agenda, so later edits never rewrite
   history.
3. **The Occurrence is the bridge.** It links to at most one Scheduled meeting and to the recorded
   Meetings that captured it. The recorded `TranscriptionSession` gains a nullable occurrence
   link, set by calendar recurrence id, by title alias, or by hand. Neither model is renamed or
   merged; the wart stays and the deferred "unify the lifecycle" question is answered *by
   composition*, not by a merge.
4. **The Ritual rule is superseded.** A Ritual is a Ceremony; a recorded meeting is one
   occurrence's capture. "Meeting type" resolves as: 1:1 stays derived from participant count,
   and a meeting is a ceremony meeting when it has an occurrence. No `meetingType` column.
5. **Agenda sections are typed and query-bound.** Each section binds to a deterministic query over
   workspace data (blockers, carried-over items, open Decisions, key results without a recent
   check-in, cycle progress, retro actions). The LLM narrates the results; an item with no
   underlying record is never produced. This extends ADR-0007's deterministic-then-refine rule
   from Actions to agendas.
6. **`OkrCheckin` and `Retrospective` stay as they are** for now. Migrating them onto occurrences
   is a separate decision once the general entity has carried real CLEAR ceremonies.

## Considered alternatives

- **A `meetingType` enum on `TranscriptionSession`.** Rejected: it classifies a recording after
  the fact but carries no purpose, cadence, owner or agenda, so nothing can run *before* the
  meeting, which is the point.
- **A third bespoke model for standups.** Rejected: it compounds the `OkrCheckin` /
  `Retrospective` duplication; the general entity is what those two should have been.
- **Merging `TranscriptionSession` and `Meeting` into one lifecycle row.** Rejected: churn across
  every meeting consumer and the visibility resolver (ADR-0014) for a join the occurrence
  achieves without touching either table.
- **Product-parented ceremonies.** Rejected: CLEAR has one product, ceremonies routinely span
  products (all-hands), and the `Retrospective` precedent is workspace-owned with an optional
  product.
- **Free-text LLM agendas.** Rejected: unfalsifiable and non-diffable; a fabricated agenda item
  is the same class of failure as a fabricated Action.
- **Syncing ceremony definitions from Notion.** Rejected for v1: a one-time import is enough, and
  Exponential is the source of truth afterwards.

## Consequences

- Glossary gains **Ceremony** and **Occurrence**; **Ritual** becomes an alias entry; the
  "meeting type is not stored" ambiguity is resolved as above.
- The Meetings page gets a ceremony filter and the meeting detail rail a "Part of" row.
- `PreMeetingBrief` and the dormant "Meeting Preparation" workflow template are superseded by
  occurrence agendas and should be removed once V2 ships.
- A new notification category, "agenda ready", joins the ADR-0045 matrix.
- Ceremony health (cadence adherence, overrun, agenda drift, follow-through, decision churn) becomes
  computable from occurrences and their outputs; it is a separate feature.
- Both this feature and Decisions (ADR-0060) add migrations; their schema tickets stack on one
  branch rather than forking independently off main.

## Amendment: a Ceremony may be one-off (2026-10-07)

Decision 1 called a Ceremony a *recurring* definition. An ad hoc meeting scheduled from a project
("Schedule meeting" on the project Meetings tab, or the calendar-page modal with a project linked)
needs everything an occurrence already has — a generated agenda, the notes page, hand-added items,
Matrix posting, the capture lifecycle, auto-attach of the recording by iCal UID — but has no
cadence.

A one-off Ceremony has no cadence rule, exactly one Occurrence, its Scheduled meeting linked through
the occurrence's existing `scheduledMeetingId` (never populated before this), the organizer as
owner, the meeting title as its name, the meeting's **purpose** as `purpose`, and the member
attendees as participants (external attendees live on the Scheduled meeting only). It never appears
at Settings → Ceremonies or in a project's Ceremonies list, and the word "ceremony" is never shown
for it. Cancelling its Scheduled meeting skips the occurrence ("Meeting cancelled") and deactivates
the ceremony; rebooking creates a fresh one-off.

The agenda is generated at booking so the organizer sees a draft, and left *planned* so the
lead-time sweep regenerates and circulates it with fresh data; hand-added items survive the merge
as they do today. Its template is built from the sections that make sense without a previous
occurrence — project state, blockers, open decisions, key results, linked projects, free text — chosen
through purpose presets over a checklist that previews what each section would produce.

**Considered alternative:** keeping Ceremony strictly recurring and letting an Occurrence stand
alone on its definition snapshot. Rejected: `ceremonyId` is the occurrence's identity, every section
module reads `ctx.ceremony`, and the agenda, notes and attach paths would each need a second host.
Relaxing "recurring" costs one nullable column and a flag.

**Consequence:** Scheduled-meeting attendees are no longer members only; an **Attendee** may be an
external person known by email with an optional CRM contact, mirroring **Participant** on the
recorded Meeting so the two match on email when a recording attaches. Availability still comes from
members only.
