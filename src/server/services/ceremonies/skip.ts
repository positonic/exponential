/**
 * The empty-agenda skip proposal (ADR-0059, V3). A standup whose generated
 * agenda has nothing in any section, and where nobody flagged a blocker, is
 * worth not holding: the async summary already says what the meeting would
 * have said.
 *
 * The proposal is only ever an offer. Nothing skips itself — `skipOccurrence`
 * is a deliberate act by the ceremony's owner, and it records a reason so a
 * skipped occurrence is distinguishable from one nobody got to.
 */
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { readAgendaSnapshot } from "./agenda/types";
import { formatOccurrenceLabel } from "./activity";
import { supportsAsyncUpdates } from "./updates/questions";

export interface SkipProposal {
  proposed: boolean;
  /** Why not, when it isn't proposed — shown to the owner rather than hidden. */
  reason:
    | "agenda-has-items"
    | "blocker-flagged"
    | "no-agenda-yet"
    | "not-async"
    | "already-resolved"
    | null;
}

/**
 * Whether this occurrence should be offered as a skip. Read after generation
 * and on the occurrence page; never acts on its own.
 */
export async function evaluateSkipProposal(
  db: PrismaClient,
  occurrenceId: string,
): Promise<SkipProposal> {
  const occurrence = await db.ceremonyOccurrence.findUnique({
    where: { id: occurrenceId },
    select: {
      status: true,
      agenda: true,
      agendaGeneratedAt: true,
      ceremony: { select: { kind: true } },
    },
  });
  if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
  if (!supportsAsyncUpdates(occurrence.ceremony.kind)) return { proposed: false, reason: "not-async" };
  if (occurrence.status === "SKIPPED" || occurrence.status === "CAPTURED" || occurrence.status === "FOLLOWED_THROUGH") {
    return { proposed: false, reason: "already-resolved" };
  }

  const agenda = readAgendaSnapshot(occurrence.agenda);
  // No agenda at all is not the same as an empty one: nothing has looked yet,
  // so there is nothing to conclude from the silence.
  if (!agenda) return { proposed: false, reason: "no-agenda-yet" };
  const itemCount = agenda.sections.reduce((n, section) => n + section.items.length, 0);
  if (itemCount > 0) return { proposed: false, reason: "agenda-has-items" };

  const blocker = await db.ceremonyOccurrenceUpdate.findFirst({
    where: { occurrenceId, flaggedBlocker: true, submittedAt: { not: null } },
    select: { id: true },
  });
  if (blocker) return { proposed: false, reason: "blocker-flagged" };

  return { proposed: true, reason: null };
}

export interface SkipOccurrenceInput {
  occurrenceId: string;
  workspaceId: string;
  reason: string;
  actorUserId: string;
}

/** Mark an occurrence skipped, with the reason on the record. */
export async function skipOccurrence(db: PrismaClient, input: SkipOccurrenceInput) {
  const occurrence = await db.ceremonyOccurrence.findFirst({
    where: { id: input.occurrenceId, workspaceId: input.workspaceId },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      ceremony: { select: { id: true, name: true, timezone: true } },
    },
  });
  if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
  if (occurrence.status === "CAPTURED" || occurrence.status === "FOLLOWED_THROUGH") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This occurrence already happened" });
  }
  // A second skip would re-notify everyone (the notice is keyed per skip
  // write); undo first if the reason needs changing.
  if (occurrence.status === "SKIPPED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This occurrence is already skipped" });
  }

  const updated = await db.ceremonyOccurrence.update({
    where: { id: occurrence.id },
    data: { status: "SKIPPED", skipReason: input.reason },
    select: { id: true, status: true, skipReason: true },
  });

  await recordActivity(db, {
    workspaceId: input.workspaceId,
    userId: input.actorUserId,
    entityType: "ceremony_occurrence",
    entityId: occurrence.id,
    action: "updated",
    metadata: {
      name: formatOccurrenceLabel(occurrence.ceremony.name, occurrence.scheduledStart, occurrence.ceremony.timezone),
      ceremonyId: occurrence.ceremony.id,
      skipped: true,
      skipReason: input.reason,
    },
  }).catch(() => {
    /* instrumentation failure is non-fatal */
  });

  return updated;
}

/** Restore a skipped occurrence to the agenda flow. */
export async function unskipOccurrence(db: PrismaClient, input: Omit<SkipOccurrenceInput, "reason">) {
  const occurrence = await db.ceremonyOccurrence.findFirst({
    where: { id: input.occurrenceId, workspaceId: input.workspaceId, status: "SKIPPED" },
    select: { id: true, agendaCirculatedAt: true },
  });
  if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Skipped occurrence not found" });
  return db.ceremonyOccurrence.update({
    where: { id: occurrence.id },
    data: {
      status: occurrence.agendaCirculatedAt ? "AGENDA_CIRCULATED" : "PLANNED",
      skipReason: null,
    },
    select: { id: true, status: true, skipReason: true },
  });
}
