/**
 * What a cadence change does to the occurrences already on the calendar
 * (ADR-0059 amendment, 2026-10-21; revised 2026-11-09).
 *
 * When the rule, zone, anchor date or duration of a recurring ceremony
 * changes, its future on-tick PLANNED occurrences are reconciled with the new
 * schedule instead of being dropped wholesale:
 *
 * - a row whose tick the new rule still produces keeps its id (so saved
 *   occurrence links keep working) and is re-timed to the new duration;
 * - a row the new rule no longer produces is deleted only when nobody has put
 *   anything on it;
 * - a row the new rule no longer produces but that holds human input — an
 *   agenda, a notes page, async updates, linked decisions or actions — is
 *   marked SKIPPED with a reason instead. Its data survives, the agenda sweep
 *   (PLANNED only) stops circulating it, and the owner can unskip it. The
 *   caller sends the usual skip notice for each one once its transaction
 *   commits (`skippedOccurrenceIds`), as an explicit skip does.
 *
 * Rows that are moved off their tick, added by hand (null `cadenceStart`),
 * booked (`scheduledMeetingId`) or recorded are deliberate acts and are never
 * touched, as before.
 *
 * Shared by `ceremony.update` and `ceremony.importDefinitions` so both edit
 * paths treat the calendar the same way.
 */
import { Prisma, type Ceremony, type PrismaClient } from "@prisma/client";
import { expandOccurrences } from "./expandOccurrences";

type Db = PrismaClient | Prisma.TransactionClient;

type CadenceFields = Pick<Ceremony, "cadenceRule" | "timezone" | "startsOn" | "durationMinutes">;

/**
 * Reason written on an occurrence skipped because the cadence moved away from
 * it. Participants read it in the skip notice (`<when> · <reason> — …`), so
 * it stays short and says what happened, not what the owner could do.
 */
export const CADENCE_CHANGE_SKIP_REASON = "Dropped from the schedule when the ceremony's cadence changed";

/** Whether any field that decides when occurrences fall has changed. */
export function cadenceChanged(before: CadenceFields, after: CadenceFields): boolean {
  return (
    before.cadenceRule !== after.cadenceRule ||
    before.timezone !== after.timezone ||
    before.startsOn.getTime() !== after.startsOn.getTime() ||
    before.durationMinutes !== after.durationMinutes
  );
}

/** A future on-tick occurrence, with what people have put on it. */
export interface CadenceCandidate {
  id: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  cadenceStart: Date | null;
  agenda: Prisma.JsonValue | null;
  agendaCirculatedAt: Date | null;
  notesPageId: string | null;
  _count: { updates: number; decisions: number; actions: number };
}

/** Anything a person (or a circulated agenda they read) has attached to the occurrence. */
export function holdsHumanInput(row: CadenceCandidate): boolean {
  return (
    row.agenda !== null ||
    row.agendaCirculatedAt !== null ||
    row.notesPageId !== null ||
    row._count.updates > 0 ||
    row._count.decisions > 0 ||
    row._count.actions > 0
  );
}

export interface CadencePlan {
  /** Still on the new schedule; keep the row, set this end time. */
  retime: Array<{ id: string; scheduledEnd: Date }>;
  /** Off the new schedule and empty. */
  deleteIds: string[];
  /** Off the new schedule but holding human input. */
  skipIds: string[];
}

/**
 * Sort candidates against the new schedule. Pure: `ceremony` is the
 * definition after the change.
 */
export function planCadenceChange(
  ceremony: CadenceFields & Pick<Ceremony, "isOneOff">,
  candidates: CadenceCandidate[],
): CadencePlan {
  const plan: CadencePlan = { retime: [], deleteIds: [], skipIds: [] };
  // Moved rows keep their tick but are a deliberate act; leave them alone.
  const onTick = candidates.filter((o) => o.cadenceStart?.getTime() === o.scheduledStart.getTime());
  if (onTick.length === 0) return plan;

  const ticks = new Set<number>();
  if (!ceremony.isOneOff && ceremony.cadenceRule) {
    const starts = onTick.map((o) => o.scheduledStart.getTime());
    const slots = expandOccurrences(
      { ...ceremony, cadenceRule: ceremony.cadenceRule },
      new Date(Math.min(...starts)),
      new Date(Math.max(...starts)),
    );
    for (const slot of slots) ticks.add(slot.scheduledStart.getTime());
  }

  const durationMs = ceremony.durationMinutes * 60_000;
  for (const row of onTick) {
    const start = row.scheduledStart.getTime();
    if (ticks.has(start)) {
      const scheduledEnd = new Date(start + durationMs);
      if (scheduledEnd.getTime() !== row.scheduledEnd.getTime()) plan.retime.push({ id: row.id, scheduledEnd });
    } else if (holdsHumanInput(row)) {
      plan.skipIds.push(row.id);
    } else {
      plan.deleteIds.push(row.id);
    }
  }
  return plan;
}

export interface CadenceChangeResult {
  occurrencesDeleted: number;
  occurrencesSkipped: number;
  /** The rows marked SKIPPED; the caller notifies participants after commit. */
  skippedOccurrenceIds: string[];
}

/**
 * Reconcile future occurrences after `before` became `after`. A no-op when no
 * cadence field changed. Run it in the same transaction as the definition
 * write, then call `ensureOccurrences` for the new ticks.
 */
export async function applyCadenceChange(
  db: Db,
  before: CadenceFields,
  after: CadenceFields & Pick<Ceremony, "id" | "isOneOff">,
  now = new Date(),
): Promise<CadenceChangeResult> {
  const result: CadenceChangeResult = { occurrencesDeleted: 0, occurrencesSkipped: 0, skippedOccurrenceIds: [] };
  if (!cadenceChanged(before, after)) return result;
  // Nothing on a one-off or a rule-less ceremony derives from a cadence (a
  // one-off's occurrence has no tick), so there is nothing to reconcile —
  // and an empty tick set must never read as "every tick was dropped".
  if (after.isOneOff || !after.cadenceRule) return result;

  // Every write below repeats these conditions, so a row booked, recorded,
  // skipped or captured after this read is left alone.
  const stillUntouched = {
    status: "PLANNED",
    scheduledMeetingId: null,
    recordedMeetings: { none: {} },
  } satisfies Prisma.CeremonyOccurrenceWhereInput;

  const candidates = await db.ceremonyOccurrence.findMany({
    where: {
      ...stillUntouched,
      ceremonyId: after.id,
      scheduledStart: { gt: now },
      cadenceStart: { not: null },
    },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      cadenceStart: true,
      agenda: true,
      agendaCirculatedAt: true,
      notesPageId: true,
      _count: { select: { updates: true, decisions: true, actions: true } },
    },
  });
  const plan = planCadenceChange(after, candidates);

  for (const row of plan.retime) {
    // updateMany, not update: a row deleted or booked meanwhile is skipped
    // rather than failing the whole ceremony edit.
    await db.ceremonyOccurrence.updateMany({
      where: { ...stillUntouched, id: row.id },
      data: { scheduledEnd: row.scheduledEnd },
    });
  }
  if (plan.skipIds.length > 0) {
    const skipped = await db.ceremonyOccurrence.updateMany({
      where: { ...stillUntouched, id: { in: plan.skipIds } },
      data: { status: "SKIPPED", skipReason: CADENCE_CHANGE_SKIP_REASON },
    });
    result.occurrencesSkipped = skipped.count;
    // Notify only for rows this write actually skipped.
    result.skippedOccurrenceIds =
      skipped.count === plan.skipIds.length
        ? plan.skipIds
        : (
            await db.ceremonyOccurrence.findMany({
              where: { id: { in: plan.skipIds }, status: "SKIPPED", skipReason: CADENCE_CHANGE_SKIP_REASON },
              select: { id: true },
            })
          ).map((o) => o.id);
  }
  if (plan.deleteIds.length > 0) {
    // Re-check emptiness in the delete itself: something added between the
    // read and here must not be destroyed.
    const deleted = await db.ceremonyOccurrence.deleteMany({
      where: {
        ...stillUntouched,
        id: { in: plan.deleteIds },
        agenda: { equals: Prisma.AnyNull },
        agendaCirculatedAt: null,
        notesPageId: null,
        updates: { none: {} },
        decisions: { none: {} },
        actions: { none: {} },
      },
    });
    result.occurrencesDeleted = deleted.count;
  }
  return result;
}
