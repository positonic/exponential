/**
 * Hand-scheduled occurrences (ADR-0059 amendment, 2026-10-21). The hourly
 * expansion puts an occurrence on every cadence tick; real meetings drift
 * off those ticks, and some are held when no tick says so. Two deliberate
 * acts by the ceremony's owner cover that:
 *
 * - `addOccurrence` writes one occurrence at any time, with `cadenceStart`
 *   set when that time happens to be a tick (so it *is* the tick's
 *   occurrence, created early) and null otherwise (ad hoc).
 * - `rescheduleOccurrence` moves an occurrence's `scheduledStart` and keeps
 *   its `cadenceStart`, so the vacated tick is still accounted for and the
 *   expansion never re-inserts it. Agenda, notes page, updates and linked
 *   recordings ride along — a move is a property change, not a new row.
 *
 * Neither touches a Scheduled meeting: a booked one-off reschedules by
 * cancel + rebook, as the glossary says, and is refused here.
 */
import { TRPCError } from "@trpc/server";
import type { Ceremony, PrismaClient } from "@prisma/client";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { expandOccurrences } from "./expandOccurrences";
import { snapshotCeremony } from "./occurrences";
import { formatOccurrenceLabel } from "./activity";

/** True when `at` is exactly a cadence tick of the ceremony. */
export function isCadenceTick(
  ceremony: Pick<Ceremony, "cadenceRule" | "timezone" | "startsOn" | "durationMinutes" | "isOneOff">,
  at: Date,
): boolean {
  if (ceremony.isOneOff || !ceremony.cadenceRule) return false;
  return expandOccurrences({ ...ceremony, cadenceRule: ceremony.cadenceRule }, at, at).length > 0;
}

/**
 * No other occurrence may hold the time, by start or by tick. `excludeId` is
 * the row being moved: it keeps its own tick, so moving it back onto that
 * tick must not read as a clash with itself.
 */
async function assertSlotFree(db: PrismaClient, ceremonyId: string, scheduledStart: Date, excludeId?: string): Promise<void> {
  const clash = await db.ceremonyOccurrence.findFirst({
    where: {
      ceremonyId,
      OR: [{ scheduledStart }, { cadenceStart: scheduledStart }],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new TRPCError({ code: "CONFLICT", message: "This ceremony already has an occurrence at that time" });
  }
}

export interface AddOccurrenceInput {
  ceremony: Ceremony;
  scheduledStart: Date;
  actorUserId: string;
}

/** Add one occurrence at any time; a time on the cadence becomes that tick's occurrence. */
export async function addOccurrence(db: PrismaClient, input: AddOccurrenceInput) {
  const { ceremony, scheduledStart } = input;
  if (ceremony.isOneOff) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A one-off meeting has exactly one occurrence" });
  }
  await assertSlotFree(db, ceremony.id, scheduledStart);
  const onTick = isCadenceTick(ceremony, scheduledStart);
  const occurrence = await db.ceremonyOccurrence.create({
    data: {
      ceremonyId: ceremony.id,
      workspaceId: ceremony.workspaceId,
      scheduledStart,
      scheduledEnd: new Date(scheduledStart.getTime() + ceremony.durationMinutes * 60_000),
      cadenceStart: onTick ? scheduledStart : null,
      definitionSnapshot: snapshotCeremony(ceremony),
    },
    select: { id: true, scheduledStart: true, scheduledEnd: true, cadenceStart: true, status: true },
  });
  await recordActivity(db, {
    workspaceId: ceremony.workspaceId,
    userId: input.actorUserId,
    entityType: "ceremony_occurrence",
    entityId: occurrence.id,
    action: "created",
    metadata: {
      name: formatOccurrenceLabel(ceremony.name, scheduledStart, ceremony.timezone),
      ceremonyId: ceremony.id,
      count: 1,
      adHoc: !onTick,
    },
  }).catch(() => {
    /* instrumentation failure is non-fatal */
  });
  return occurrence;
}

export interface RescheduleOccurrenceInput {
  occurrenceId: string;
  workspaceId: string;
  scheduledStart: Date;
  actorUserId: string;
}

/** Move an occurrence that has not happened yet to another time, keeping its duration. */
export async function rescheduleOccurrence(db: PrismaClient, input: RescheduleOccurrenceInput) {
  const occurrence = await db.ceremonyOccurrence.findFirst({
    where: { id: input.occurrenceId, workspaceId: input.workspaceId },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      scheduledMeetingId: true,
      ceremony: { select: { id: true, name: true, timezone: true, isOneOff: true } },
    },
  });
  if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
  if (occurrence.status === "CAPTURED" || occurrence.status === "FOLLOWED_THROUGH") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This occurrence already happened" });
  }
  if (occurrence.status === "SKIPPED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This occurrence is skipped — unskip it first" });
  }
  // A booking lives in attendees' calendars; moving the row would leave them
  // holding the old time. Cancel + rebook is the Scheduled-meeting rule.
  if (occurrence.ceremony.isOneOff || occurrence.scheduledMeetingId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This meeting is booked in calendars — cancel it and schedule a new one instead",
    });
  }
  if (occurrence.scheduledStart.getTime() === input.scheduledStart.getTime()) {
    return { id: occurrence.id, scheduledStart: occurrence.scheduledStart, scheduledEnd: occurrence.scheduledEnd, movedFrom: null };
  }
  await assertSlotFree(db, occurrence.ceremony.id, input.scheduledStart, occurrence.id);

  const durationMs = occurrence.scheduledEnd.getTime() - occurrence.scheduledStart.getTime();
  const updated = await db.ceremonyOccurrence.update({
    where: { id: occurrence.id },
    data: {
      scheduledStart: input.scheduledStart,
      scheduledEnd: new Date(input.scheduledStart.getTime() + durationMs),
    },
    select: { id: true, scheduledStart: true, scheduledEnd: true },
  });
  await recordActivity(db, {
    workspaceId: input.workspaceId,
    userId: input.actorUserId,
    entityType: "ceremony_occurrence",
    entityId: occurrence.id,
    action: "updated",
    metadata: {
      name: formatOccurrenceLabel(occurrence.ceremony.name, input.scheduledStart, occurrence.ceremony.timezone),
      ceremonyId: occurrence.ceremony.id,
      moved: true,
      movedFrom: occurrence.scheduledStart.toISOString(),
    },
  }).catch(() => {
    /* instrumentation failure is non-fatal */
  });
  return { ...updated, movedFrom: occurrence.scheduledStart };
}
