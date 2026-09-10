/**
 * Circulate a generated agenda (ADR-0059): one `agenda_ready` notification
 * to the ceremony's participants and team, the PLANNED → AGENDA_CIRCULATED
 * transition, and an activity event. Idempotent: an occurrence circulated
 * once is never circulated again by the cron; a person may re-circulate on
 * purpose through the mutation.
 */
import { type PrismaClient } from "@prisma/client";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { formatOccurrenceLabel } from "../activity";
import { generateAgenda } from "./generateAgenda";
import { readAgendaSnapshot } from "./types";
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
  /** Set when the run stopped on its time budget with candidates left. */
  deferred: number;
  errors: Array<{ occurrenceId: string; message: string }>;
}

/** The furthest lead time any ceremony can ask for (two weeks), bounding the candidate query. */
const MAX_LEAD_MS = 14 * 24 * 60 * 60_000;

/**
 * A `leadTimeHours: 0` ceremony means "generate it as the meeting starts".
 * The candidate window therefore reaches slightly into the past, and the
 * due test allows a non-positive delta — otherwise `scheduledStart > now`
 * and `scheduledStart - now <= 0` are mutually exclusive and such a
 * ceremony would never get an agenda at all.
 */
const START_GRACE_MS = 60 * 60_000;

/**
 * Stop well inside the route's `maxDuration = 300` so the loop finishes on
 * its own terms. Being killed mid-iteration is what used to strand an
 * occurrence between generation and circulation.
 */
const SWEEP_BUDGET_MS = 240_000;

/** Bounded so one run is predictable; the next hour picks up the remainder. */
const SWEEP_BATCH = 40;

/**
 * Hourly sweep (`/api/cron/ceremony-agendas`): every PLANNED occurrence
 * inside its ceremony's `leadTimeHours` gets an agenda generated and
 * circulated, inside the request. One bad occurrence never stops the sweep.
 *
 * Candidates are selected on "not yet circulated", NOT on "has no agenda":
 * generation and circulation are two writes, and anything between them (a
 * throw, or this function being killed) would otherwise leave the
 * occurrence with an agenda and outside every future sweep, so it would
 * never be circulated at all. `generateAgenda` is idempotent and
 * `circulateAgenda` no-ops once `agendaCirculatedAt` is set, so re-driving
 * a half-finished occurrence is safe.
 */
export async function sweepDueAgendas(db: PrismaClient, now = new Date()): Promise<AgendaSweepResult> {
  const startedAt = Date.now();
  const rows = await db.ceremonyOccurrence.findMany({
    where: {
      status: "PLANNED",
      agendaCirculatedAt: null,
      scheduledStart: {
        gt: new Date(now.getTime() - START_GRACE_MS),
        lte: new Date(now.getTime() + MAX_LEAD_MS),
      },
      ceremony: { isActive: true },
    },
    select: { id: true, scheduledStart: true, agenda: true, ceremony: { select: { leadTimeHours: true } } },
    orderBy: { scheduledStart: "asc" },
    take: 200,
  });
  const due = rows.filter(
    (o) => o.scheduledStart.getTime() - now.getTime() <= o.ceremony.leadTimeHours * 60 * 60_000,
  );
  const result: AgendaSweepResult = { candidates: due.length, generated: 0, circulated: 0, deferred: 0, errors: [] };
  let processed = 0;
  for (const occ of due) {
    if (processed >= SWEEP_BATCH || Date.now() - startedAt > SWEEP_BUDGET_MS) {
      result.deferred = due.length - processed;
      break;
    }
    processed += 1;
    try {
      // Only generate when there is nothing to circulate yet — an occurrence
      // that generated last run and died before circulating just needs the
      // second half.
      if (!readAgendaSnapshot(occ.agenda)) {
        await generateAgenda(db, occ.id, { now });
        result.generated += 1;
      }
      const { circulated } = await circulateAgenda(db, occ.id, { actorUserId: null, now });
      if (circulated) result.circulated += 1;
    } catch (err) {
      result.errors.push({ occurrenceId: occ.id, message: err instanceof Error ? err.message : String(err) });
      // The cron route discards its response body, so an error that only
      // lands there is invisible. A stranded occurrence is silent by nature.
      reportHandledErrorServer(err, {
        area: "ceremonies.sweepDueAgendas",
        context: { occurrenceId: occ.id },
      });
    }
  }
  return result;
}
