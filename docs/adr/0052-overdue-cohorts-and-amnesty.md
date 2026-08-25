# Overdue triage: bulk-write cohorts detected by exact instant, amnesty as its own verb

## Status

Accepted — 2026-08-04

## Context

A user opened `/today` to 40 overdue actions and reported being overwhelmed. The
pile was not 40 missed commitments: **21 of the 40 were two bulk writes** — 17
actions stamped `2026-07-25T08:29:55.483Z` across six projects, and 4 stamped
`2026-07-23T07:00:00.000Z` — generated project plans that received one blanket
date at creation. Only 19 were individually-dated debt.

The only bulk affordance on the page is **"Reschedule all → Today"**
(`action.bulkReschedule`), which sets `scheduledStart` to now for every selected
action. Applied to this pile it moves 40 items forward 24 hours and re-inflicts
them tomorrow — it treats a data-provenance artifact as a scheduling problem.
Nothing in the product distinguishes "you missed this" from "nobody ever
intended this to be due that day", so neither the user nor an agent can propose
a disposition better than "move it all".

This blocks the morning-agent work: an agent handed 40 undifferentiated overdue
rows can only summarize them. The useful sentence — *"17 of these were written
in one batch and were never individually due; want them back in their project
backlogs?"* — requires a distinction the data model does not currently express.

## Decision

Add a **read** that classifies the pile and a **write** that expresses amnesty.

- **Cohorts are detected by exact anchor instant.** `groupOverdueCohorts()` in
  `~/lib/actions/triage.ts` groups overdue actions by their `overdueAnchor`
  (`scheduledStart`, else `dueDate`) at **millisecond** equality; ≥3 members is
  a cohort, everything else is `loose`. The heuristic is deliberately crude and
  deliberately exact: a human dating actions one at a time carries the
  millisecond they hit save, so collisions are effectively impossible, while a
  single `createMany` writes one identical value to every row. No timestamp
  metadata, no `source` sniffing, no model call — the fingerprint is already in
  the data.

- **`action.getOverdueTriage`** returns `{ totalOverdue, cohortCount, cohorts,
  loose }`, each cohort carrying `stampedAt`, `count`, `daysOverdue`,
  `projectNames`, and `actionIds` — enough for a caller to *explain* the cohort
  before acting on it. It reuses `partitionActions()` for the overdue set, so it
  and `/today` always describe the same pile ([ADR-0034](0034-todays-actions-shared-partition.md)).

- **`action.bulkDefer` is a separate procedure from `bulkReschedule`**, despite
  clearing the same columns that `bulkReschedule({ dueDate: null })` clears. The
  row effect is identical; the *intent* is not, and intent is the thing callers
  need to express — most of all agents, whose tool discovery is BM25 over tool
  descriptions. A verb named "defer" with a description about untimed backlogs
  is findable for "these were never due"; an overload of "reschedule" with a
  null argument is not. It also gives the two operations independent activity
  provenance.

- **Amnesty touches dates only.** `kanbanStatus` is left alone: an action can be
  untimed and still in progress on a board.

- The suggestion generator (`scheduling.getSchedulingSuggestions`) is moved onto
  `partitionActions()` in the same change. It selected overdue by `dueDate <
  today` while the panel that renders it is *gated* on the client partition, so
  the banner could appear over a pile it had nothing to say about, and it
  ignored every scheduled-but-never-due action.

## Considered alternatives

- **Fuzzy clustering (same minute / same hour / same day).** Rejected — it
  merges genuinely distinct decisions. Three actions dated across one working
  day are three choices; three sharing a millisecond are one. Widening the
  window trades a heuristic with essentially no false positives for one with
  many, to catch bulk writes that are rare in practice (a `createMany` shares an
  instant; only a slow scripted loop would not).
- **Persist the provenance instead — a `batchId` written at creation.** The
  honest fix, and not exclusive with this one, but it is schema + migration +
  backfill and it cannot classify a single existing row. The anchor fingerprint
  works on data already in the database, today. Revisit if cohort quality proves
  insufficient.
- **Use `Action.source` or `createdAt` proximity.** Rejected — `source` records
  the channel (`app`, `notion`, `api`), not the write, and is identical across
  hand-created and bulk-created actions from the same surface. `createdAt`
  proximity has the fuzzy-window problem plus false positives from any busy
  minute of manual entry.
- **Let the LLM classify the pile.** Rejected as the primary mechanism — it is a
  deterministic grouping over a timestamp, it must be right the same way every
  time, and it should not cost a model call. The agent's job is to *propose the
  disposition* from the grouping, which is genuinely judgement.
- **Only add `getOverdueTriage`, reuse `bulkReschedule(null)` for the write.**
  Rejected on discovery grounds above.

## Consequences

- New `~/lib/actions/triage.ts` (`groupOverdueCohorts`, `daysOverdue`,
  `COHORT_MIN_SIZE`) with unit tests; pure and clock-injected like
  `partitionActions`.
- New `action.getOverdueTriage` and `action.bulkDefer`; `mastra.updateAction`
  gains `scheduledStart` / `scheduledEnd` / `duration` — until now no agent
  could write a "do date" at all, so no agent could move anything out of the
  overdue bucket.
- `scheduling.getSchedulingSuggestions` now fetches ACTIVE actions and
  partitions in memory rather than filtering by `dueDate` in SQL, matching the
  existing `getTodaysActions` pattern.
- CONTEXT.md gains **Overdue cohort** and **Amnesty**. These become the shared
  vocabulary for the CLI, SDK, MCP server, and Mastra tools that wrap this
  contract.
- The cohort threshold (3) and exact-instant rule are heuristics, recorded here
  so a future reader knows they were chosen, not inherited.
