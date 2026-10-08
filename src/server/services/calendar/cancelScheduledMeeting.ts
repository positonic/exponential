/**
 * Cancel a Scheduled meeting: flip it to `cancelled`, bump SEQUENCE and email
 * METHOD:CANCEL against the original UID to every attendee with an address —
 * which is what removes the event from their real calendars (no API
 * write-back). Authorization is the caller's job.
 *
 * A one-off ceremony's booking (ADR-0059 amendment, 2026-10-07) also takes
 * its occurrence and ceremony down with it: the occurrence is skipped with
 * "Meeting cancelled" (or the reason given; unless it is already skipped or
 * captured) and the ceremony is deactivated. Skipping a one-off comes through
 * here too, so neither path leaves a phantom; rebooking makes a fresh one-off.
 *
 * The three writes commit together, and the emails go only after: a failure
 * can never leave a cancelled booking beside a live occurrence that the agenda
 * sweep would still circulate, and a retry finds either nothing done or
 * everything done.
 */
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { buildInviteIcs } from "./inviteIcs";
import { sendMeetingInviteEmail } from "~/server/services/EmailService";
import { recordOccurrenceSkipped } from "~/server/services/ceremonies/skip";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

export const MEETING_CANCELLED_SKIP_REASON = "Meeting cancelled";

export interface CancelScheduledMeetingResult {
  id: string;
  status: string;
  invitesSent: number;
}

/** Loads the meeting the way cancellation needs it; null when it is not in the workspace. */
export function loadMeetingForCancel(db: PrismaClient, workspaceId: string, meetingId: string) {
  return db.meeting.findFirst({
    where: { id: meetingId, workspaceId },
    include: {
      attendees: true,
      organizer: { select: { id: true, name: true, email: true } },
      occurrence: {
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          ceremony: { select: { id: true, isOneOff: true, name: true, timezone: true } },
        },
      },
    },
  });
}

export async function cancelScheduledMeeting(
  db: PrismaClient,
  input: {
    workspaceId: string;
    meetingId: string;
    actorUserId: string;
    /** Why a one-off's occurrence is skipped; the skip path passes the owner's reason. */
    skipReason?: string;
  },
): Promise<CancelScheduledMeetingResult> {
  const meeting = await loadMeetingForCancel(db, input.workspaceId, input.meetingId);
  if (!meeting) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
  }
  if (meeting.status === "cancelled") {
    return { id: meeting.id, status: meeting.status, invitesSent: 0 };
  }

  const occurrence = meeting.occurrence?.ceremony.isOneOff ? meeting.occurrence : null;
  const skips =
    !!occurrence &&
    occurrence.status !== "SKIPPED" &&
    occurrence.status !== "CAPTURED" &&
    occurrence.status !== "FOLLOWED_THROUGH";
  const skipReason = input.skipReason ?? MEETING_CANCELLED_SKIP_REASON;

  const cancelled = await db.$transaction(async (tx) => {
    const updated = await tx.meeting.update({
      where: { id: meeting.id },
      data: { status: "cancelled", sequence: { increment: 1 } },
      select: { sequence: true },
    });
    if (occurrence) {
      if (skips) {
        await tx.ceremonyOccurrence.update({
          where: { id: occurrence.id },
          data: { status: "SKIPPED", skipReason },
        });
      }
      await tx.ceremony.update({ where: { id: occurrence.ceremony.id }, data: { isActive: false } });
    }
    return updated;
  });
  if (occurrence && skips) {
    await recordOccurrenceSkipped(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      occurrence,
      reason: skipReason,
    });
  }

  const organizer = {
    name: meeting.organizer.name,
    email: meeting.organizer.email ?? "noreply@exponential.im",
  };
  // Members without an email carry the `user:<id>` sentinel and are never emailed.
  const recipients = meeting.attendees.filter((a) => a.email.includes("@"));
  const ics = buildInviteIcs({
    method: "CANCEL",
    uid: meeting.icalUid,
    sequence: cancelled.sequence,
    organizer,
    attendees: recipients.map((a) => ({ name: a.name, email: a.email })),
    title: meeting.title,
    description: meeting.description,
    location: meeting.location,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
  });

  let invitesSent = 0;
  for (const recipient of recipients) {
    try {
      await sendMeetingInviteEmail({
        to: recipient.email,
        method: "CANCEL",
        meetingTitle: meeting.title,
        organizerName: organizer.name ?? organizer.email,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        location: meeting.location,
        icsContent: ics,
        workspaceId: input.workspaceId,
      });
      invitesSent += 1;
    } catch (error) {
      reportHandledErrorServer(error, {
        area: "workspaceScheduling.cancelMeeting.invite",
        context: { meetingId: meeting.id },
      });
    }
  }

  return { id: meeting.id, status: "cancelled", invitesSent };
}
