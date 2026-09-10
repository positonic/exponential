/**
 * Persistence side of occurrence generation (ADR-0059). Pure expansion lives
 * in `expandOccurrences.ts`; this module snapshots the definition and writes
 * rows idempotently against the `(ceremonyId, scheduledStart)` unique.
 */
import type { Ceremony, Prisma, PrismaClient } from "@prisma/client";
import {
  expandOccurrences,
  nextOccurrence,
  occurrenceWindow,
} from "./expandOccurrences";
import { recordOccurrencesScheduled } from "./activity";

type Db = PrismaClient | Prisma.TransactionClient;

/** The ceremony as it was when an occurrence was created; never rewritten. */
export function snapshotCeremony(ceremony: Ceremony): Prisma.InputJsonObject {
  return {
    name: ceremony.name,
    slug: ceremony.slug,
    kind: ceremony.kind,
    purpose: ceremony.purpose,
    notFor: ceremony.notFor,
    inputs: ceremony.inputs,
    outputs: ceremony.outputs,
    cadenceRule: ceremony.cadenceRule,
    timezone: ceremony.timezone,
    durationMinutes: ceremony.durationMinutes,
    leadTimeHours: ceremony.leadTimeHours,
    ownerId: ceremony.ownerId,
    agendaTemplate: ceremony.agendaTemplate as Prisma.InputJsonValue,
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Ensure occurrences exist from the ceremony's anchor date through the
 * rolling window (14 days ahead of `now`), plus the single next tick when
 * that yields nothing so a monthly ceremony always has its upcoming
 * occurrence. Expanding from `startsOn` rather than from `now` is what gives
 * backfill its targets: a recording from last week can only attach to an
 * occurrence that exists. Idempotent — duplicates are skipped by the
 * `(ceremonyId, scheduledStart)` unique. Returns the number of rows inserted.
 */
export async function ensureOccurrences(
  db: Db,
  ceremony: Ceremony,
  opts: { now?: Date; windowStart?: Date; windowEnd?: Date } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const window = occurrenceWindow(now);
  const start = opts.windowStart ?? ceremony.startsOn;
  const end = opts.windowEnd ?? window.end;

  let slots = expandOccurrences(ceremony, start, end);
  if (slots.length === 0) {
    const next = nextOccurrence(ceremony, now);
    if (next) slots = [next];
  }
  if (slots.length === 0) return 0;

  const snapshot = snapshotCeremony(ceremony);
  const result = await db.ceremonyOccurrence.createMany({
    data: slots.map((slot) => ({
      ceremonyId: ceremony.id,
      workspaceId: ceremony.workspaceId,
      scheduledStart: slot.scheduledStart,
      scheduledEnd: slot.scheduledEnd,
      definitionSnapshot: snapshot,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export interface OccurrenceSweepResult {
  ceremonies: number;
  created: number;
  errors: Array<{ ceremonyId: string; message: string }>;
}

/**
 * Hourly sweep (`/api/cron/ceremony-occurrences`): expand every active
 * ceremony through the rolling window. One bad rule never stops the sweep;
 * its error is reported in the summary.
 */
export async function expandActiveCeremonies(db: Db, now = new Date()): Promise<OccurrenceSweepResult> {
  const ceremonies = await db.ceremony.findMany({ where: { isActive: true } });
  const result: OccurrenceSweepResult = { ceremonies: ceremonies.length, created: 0, errors: [] };
  for (const ceremony of ceremonies) {
    try {
      const inserted = await ensureOccurrences(db, ceremony, { now });
      result.created += inserted;
      if (typeof (db as PrismaClient).$transaction === "function") {
        await recordOccurrencesScheduled(db as PrismaClient, ceremony, inserted, null, now);
      }
    } catch (err) {
      result.errors.push({
        ceremonyId: ceremony.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}
