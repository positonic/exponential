# OKR status: manual override stored beside the auto-derived value

## Status

Accepted — 2026-06-01

## Context

An Objective's and a Key result's status badge ("AT RISK", "On track", …) is today
**derived**, and derived inconsistently:

- `Goal.health` is a "computed health cache aggregated from KRs", written by
  `recomputeHealth`. But the OKR card badge ignores it and computes a **worst-KR roll-up**
  (`objectiveRollupStatus`), while the drawer derives the badge from **progress %**
  (`statusFromProgress`). Three sources, one badge.
- `KeyResult.status` is auto-rewritten on every check-in based on progress-vs-expected.

The OKR detail drawer's "Set status" CTA needs somewhere coherent to write a human's
explicit judgement ("I know the number looks fine, but this is at risk"). There was no
column for that — writing it into `Goal.health` / `KeyResult.status` would be clobbered the
next time `recomputeHealth` or a check-in ran.

## Decision

1. **Two columns per entity, never merged at rest.** Keep the existing auto column
   (`Goal.health`, `KeyResult.status`) exactly as is — `recomputeHealth` and `checkIn`
   keep writing it. Add a nullable **manual override** column alongside:
   `Goal.healthOverride` (+ `healthOverrideAt`, `healthOverrideById`) and
   `KeyResult.statusOverride` (+ `statusOverrideAt`, `statusOverrideById`).
2. **Effective status = `override ?? auto`**, reconciled at read, applied consistently in
   the card and the drawer (this also retires the three-way derivation inconsistency —
   both surfaces compute effective status the same way).
3. **"Set status" writes the override only.** An **"Auto"** option sets the override back
   to `null`, at which point the derived value reappears. The manual path never touches
   the auto column, so a later recompute/check-in cannot silently erase a human decision,
   and clearing the override never loses the derived value.

## Considered alternatives

- **Single column, manual writes overwrite the auto value.** Rejected: the next
  `recomputeHealth`/`checkIn` clobbers the human's decision, and there is no way to tell
  "a person set this" from "the system computed this", nor to revert to auto.
- **Objective "Set status" sets lifecycle status** (`active`/`completed`/`archived`) and
  leave health fully auto. Rejected: the badge users point at is *health*, not lifecycle;
  the button would visibly not move the thing it appears to control.
- **A `manualOverride: boolean` flag plus one value column.** Rejected: you still lose the
  derived value while the override is active, so "Auto" can't restore it without a
  recompute round-trip, and history (`overrideAt`/`overrideById`) has nowhere to live.

## Consequences

- A migration adds six nullable columns; no backfill needed (null = "no override" = today's
  behaviour). Per repo rules the migration is authored but **run manually by the owner**.
- Every read site that shows a status badge must use the shared `override ?? auto` helper,
  not the raw column — including `objectiveRollupStatus` and the drawer's `statusFromProgress`,
  which are replaced by it.
- Auto-derivation keeps running underneath an override. When the override is cleared, the
  current derived value (not a stale one) is what shows — desirable.
- Audit columns (`*OverrideAt`, `*OverrideById`) let the Activity timeline attribute a
  manual status change later if we choose to surface it; not wired in v1.
