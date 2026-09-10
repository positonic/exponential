/**
 * Circulate a generated agenda (ADR-0059): one `agenda_ready` notification
 * to the ceremony's participants and team, the PLANNED → AGENDA_CIRCULATED
 * transition, and an activity event. Idempotent: an occurrence circulated
 * once is never circulated again by the cron; a person may re-circulate on
 * purpose through the mutation.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { formatOccurrenceLabel } from "../activity";
import { generateAgenda, type GenerateAgendaResult } from "./generateAgenda";
import { postAgendaToMatrix } from "./postAgendaToMatrix";

export async function circulateAgenda(
  db: PrismaClient,
  occurrenceId: string,
  opts: { actorUserId: string | null; now?: Date; force?: boolean },
): Promise<{ circulated: boolean }> {
  const now = opts.now ?? new Date();
  const occurrence = await db.ceremonyOccurrence.findUnique({
    where: { id: occurrenceId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      scheduledStart: true,
      agenda: true,
      agendaCirculatedAt: true,
      ceremony: { select: { id: true, name: true, timezone: true, matrixRoomId: true } },
    },
  });
  if (!occurrence?.agenda) return { circulated: false };
  if (occurrence.agendaCirculatedAt && !opts.force) return { circulated: false };

  await emitNotification({
    db,
    category: NOTIFICATION_CATEGORIES.AGENDA_READY,
    actorUserId: opts.actorUserId,
    subject: { occurrenceId: occurrence.id },
  });
  await db.ceremonyOccurrence.update({
    where: { id: occurrence.id },
    data: {
      agendaCirculatedAt: now,
      ...(occurrence.status === "PLANNED" ? { status: "AGENDA_CIRCULATED" } : {}),
    },
  });
  // The ceremony's Matrix room, when it has one, gets the agenda too. A
  // failed post is reported inside and never fails the circulation.
  if (occurrence.ceremony.matrixRoomId) {
    const posted = await postAgendaToMatrix(db, { occurrenceId: occurrence.id, actorUserId: opts.actorUserId, confirmRepost: opts.force });
    if (posted.kind === "failed" || posted.kind === "no-server") {
      console.error("[ceremonies] agenda Matrix post skipped:", posted.reason);
    }
  }
  await recordActivity(db, {
    workspaceId: occurrence.workspaceId,
    userId: opts.actorUserId,
    entityType: "ceremony_occurrence",
    entityId: occurrence.id,
    action: "agenda_circulated",
    metadata: {
      name: formatOccurrenceLabel(occurrence.ceremony.name, occurrence.scheduledStart, occurrence.ceremony.timezone),
      ceremonyId: occurrence.ceremony.id,
    },
  });
  return { circulated: true };
}

export interface AgendaSweepResult {
  candidates: number;
  generated: number;
  circulated: number;
  errors: Array<{ occurrenceId: string; message: string }>;
}

/** The furthest lead time any ceremony can ask for (two weeks), bounding the candidate query. */
const MAX_LEAD_MS = 14 * 24 * 60 * 60_000;

/**
 * Hourly sweep (`/api/cron/ceremony-agendas`): every PLANNED occurrence with
 * no agenda whose start is within its ceremony's `leadTimeHours` gets an
 * agenda generated and circulated, inside the request. One bad occurrence
 * never stops the sweep.
 */
export async function sweepDueAgendas(db: PrismaClient, now = new Date()): Promise<AgendaSweepResult> {
  const rows = await db.ceremonyOccurrence.findMany({
    where: {
      status: "PLANNED",
      agenda: { equals: Prisma.AnyNull },
      scheduledStart: { gt: now, lte: new Date(now.getTime() + MAX_LEAD_MS) },
      ceremony: { isActive: true },
    },
    select: { id: true, scheduledStart: true, ceremony: { select: { leadTimeHours: true } } },
    orderBy: { scheduledStart: "asc" },
    take: 200,
  });
  const due = rows.filter(
    (o) => o.scheduledStart.getTime() - now.getTime() <= o.ceremony.leadTimeHours * 60 * 60_000,
  );
  const result: AgendaSweepResult = { candidates: due.length, generated: 0, circulated: 0, errors: [] };
  for (const occ of due) {
    try {
      const generated: GenerateAgendaResult = await generateAgenda(db, occ.id, { now });
      result.generated += 1;
      const { circulated } = await circulateAgenda(db, generated.occurrenceId, { actorUserId: null, now });
      if (circulated) result.circulated += 1;
    } catch (err) {
      result.errors.push({ occurrenceId: occ.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
