/**
 * Cancel a Scheduled meeting: flip it to `cancelled`, bump SEQUENCE and email
 * METHOD:CANCEL against the original UID to every attendee with an address —
 * which is what removes the event from their real calendars (no API
 * write-back). Authorization is the caller's job.
 *
 * A one-off ceremony's booking (ADR-0059 amendment, 2026-10-07) also takes
 * its occurrence and ceremony down with it: the occurrence is skipped with
 * "Meeting cancelled" (unless it is already skipped or captured) and the
 * ceremony is deactivated. `ceremony.skipOccurrence` calls this in the other
 * direction, so neither path leaves a phantom; rebooking makes a fresh one-off.
 */
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { buildInviteIcs } from "./inviteIcs";
import { sendMeetingInviteEmail } from "~/server/services/EmailService";
import { skipOccurrence } from "~/server/services/ceremonies/skip";
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
      occurrence: { select: { id: true, status: true, ceremony: { select: { id: true, isOneOff: true } } } },
    },
  });
}

export async function cancelScheduledMeeting(
  db: PrismaClient,
  input: { workspaceId: string; meetingId: string; actorUserId: string },
): Promise<CancelScheduledMeetingResult> {
  const meeting = await loadMeetingForCancel(db, input.workspaceId, input.meetingId);
  if (!meeting) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
  }
  if (meeting.status === "cancelled") {
    return { id: meeting.id, status: meeting.status, invitesSent: 0 };
  }

  const cancelled = await db.meeting.update({
    where: { id: meeting.id },
    data: { status: "cancelled", sequence: { increment: 1 } },
    select: { sequence: true },
  });

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

  const occurrence = meeting.occurrence;
  if (occurrence?.ceremony.isOneOff) {
    if (occurrence.status !== "SKIPPED" && occurrence.status !== "CAPTURED" && occurrence.status !== "FOLLOWED_THROUGH") {
      await skipOccurrence(db, {
        occurrenceId: occurrence.id,
        workspaceId: input.workspaceId,
        reason: MEETING_CANCELLED_SKIP_REASON,
        actorUserId: input.actorUserId,
      });
    }
    await db.ceremony.update({ where: { id: occurrence.ceremony.id }, data: { isActive: false } });
  }

  return { id: meeting.id, status: "cancelled", invitesSent };
}
