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
 * Ensure occurrences exist for the rolling window (default 14 days from
 * `now`), plus the single next tick when the window is empty so a monthly
 * ceremony always has its upcoming occurrence. Returns the number of rows
 * actually inserted (duplicates are skipped by the unique constraint).
 */
export async function ensureOccurrences(
  db: Db,
  ceremony: Ceremony,
  opts: { now?: Date; windowStart?: Date; windowEnd?: Date } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const window = occurrenceWindow(now);
  const start = opts.windowStart ?? window.start;
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
