# Ceremonies are held by people or agents; a cron is a tick, a ceremony is a commitment

## Status

Accepted — 2026-10-10. Amends [ADR-0059](0059-ceremony-definition-with-occurrences.md)
(Ceremony definition) and [ADR-0067](0067-assistant-is-an-owned-external-agent.md) (Agent runs).

## Context

Recurring work in Exponential had three unrelated homes. A **Ceremony** was "a named team
meeting", later stretched to a meeting a person holds with themselves (the Daily brief). Fifteen
Vercel crons tick the system, one of which (`daily-plan-reminder`) is a user-facing commitment
dressed as plumbing. And scheduled agent routines — a Grok Bot scanning for RFPs, a Claude
Routine, the planned PM standups — had no home at all: `PMScheduler` and `PMAgentConfig` never
ran, and a plain **External agent** could not report into anything.

Three facts drove the design. Nothing can notice a commitment that is not kept: `IN_PROGRESS`
and `FOLLOWED_THROUGH` are never written, so an occurrence nobody held sits `PLANNED` forever.
An **Assistant** acts only when an **Action** is assigned to it. And a Project has no update
entity, so "stale" was computed three different ways in three places.

## Decision

1. **One entity.** A Ceremony is a recurring commitment held by a team, a person with themselves,
   or an agent. No sibling "routine" model. The holder is `Ceremony.ownerId`; an occurrence is
   *run* rather than held exactly when the owner is an agent principal. No stored mode.
2. **A run occurrence materialises one Action per tick**, assigned to the holder, with the
   generated agenda as the run's brief; `CeremonyOccurrence.actionId` links them and the Agent
   run hangs off the Action as always. Runs do not hang off occurrences directly.
3. **Exponential owns "when".** For a holder on its own scheduler the run waits `QUEUED` for the
   agent to claim it with its key, for the occurrence's duration plus grace. The enqueue gate
   widens from Assistant-only to any External agent for ceremony-sourced runs. A claim outside
   the cadence records a one-off occurrence under the same ceremony.
4. **Missed is a state.** An occurrence whose end passed with nothing captured and no skip becomes
   `MISSED` after a grace period (longer for held than for run). It is notified to the owner, or
   the agent's owner; a late recording flips it to captured; it can be retro-skipped.
5. **The Assistant is the person's chief of staff.** A miss on a ceremony the person owns or their
   agent holds also creates an Action assigned to their Assistant, whose run chases, proposes a
   skip or a reschedule, and proposes completion. No Assistant in the workspace, no Action.
6. **The project review ceremony is held by the human DRI, never an agent.** At its tick the DRI's
   Assistant drafts a **Project update** (a new entity modelled on `GoalUpdate`: Markdown, health,
   author, optional occurrence link) and mentions the DRI, who confirms. Stale means "no Project
   update inside the review cadence", the single definition.
7. **A cron is a tick; a ceremony is a commitment.** A job becomes a ceremony only when someone
   owns it, its output matters and a miss should be visible. `daily-plan-reminder` folds into the
   Daily brief's circulation. `PMScheduler`, `PMAgentConfig`, the `pmScheduler` router,
   `PMAgentWidget`, `ReminderLog`, `PreMeetingBrief` and `ScheduledNotification` are deleted.
   Syncs, retries and sweeps stay crons. Workspace updates and the thread-score digest stay as
   they are and are revisited once agent-held ceremonies have carried real load.

## Considered alternatives

- **A `Routine` sibling entity.** Rejected: it would duplicate the occurrence lifecycle, the
  query-bound agenda, carry-over, Matrix posting and both sweeps, and ADR-0059 already rejected a
  bespoke third model.
- **An explicit DRI field and mode on Ceremony.** Rejected: a human "owning" a ceremony an agent
  runs unattended is the attribution lie ADR-0049 forbids; the agent's owner is accountable by
  delegation.
- **Runs directly off occurrences (`AgentRun.actionId` nullable).** Rejected: `askOwner`,
  `commentOnAction`, the Delegated inbox and resume-on-reply all assume an Action hosts the
  conversation; each would need a second host.
- **Agents report after the fact.** Rejected: nothing could notice an agent that went quiet, which
  is the problem this ADR exists to solve.
- **Reusing `SKIPPED` for a miss.** Rejected: conflates a deliberate choice with a failure.
- **A dedicated PM Assistant holding every review.** Rejected: an agent writing status for projects
  it does not own; the DRI's name belongs on the update.
- **Every cron as a ceremony.** Rejected: a two-minute sync would produce an occurrence row every
  two minutes with nobody to hold it.

## Consequences

- Glossary: Ceremony, Occurrence, Agent run and Assistant entries amended; Project update added.
- Schema: `MISSED` on `CeremonyOccurrenceStatus`; `CeremonyOccurrence.actionId` (nullable,
  unique); `ProjectUpdate`; deletions listed in decision 7.
- `canManageCeremony` extends to the human owner of an agent holder.
- The CLI gains `runs claim` and `runs finish` so a Claude Routine or Grok Bot can hold a ceremony.
- `/w/[slug]/ceremonies` (today a 404) becomes the index of everything that runs: holder, cadence,
  next, last outcome, missed count.
- One Action row per run tick and per miss; both are assigned to agents and never reach `/today`.
