/**
 * Read path for workspace Meetings (V3) onto the calendar surfaces, shaped
 * like the provider payloads so every multi-calendar merge point treats them
 * as one more source. Attendee-scoped: a meeting appears on your calendar
 * because you're on it, whichever workspace it lives in.
 */

import type { PrismaClient } from "@prisma/client";

export interface MeetingCalendarEvent {
  accountId: string;
  accountEmail: string | null;
  calendarId: string;
  calendarName?: string;
  provider: "meeting";
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  htmlLink: string;
  status: string;
}

/**
 * Confirmed meetings the user attends (or organizes — organizers are always
 * attendees) overlapping [timeMin, timeMax). Cancelled meetings don't render:
 * the METHOD:CANCEL email is their tombstone on external calendars, and the
 * in-app surfaces mirror that.
 */
export async function listMeetingCalendarEvents(
  db: PrismaClient,
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<MeetingCalendarEvent[]> {
  const meetings = await db.meeting.findMany({
    where: {
      status: "confirmed",
      startsAt: { lt: timeMax },
      endsAt: { gt: timeMin },
      attendees: { some: { userId } },
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      location: true,
      startsAt: true,
      endsAt: true,
      workspace: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  return meetings.map((meeting) => ({
    // Keyed per workspace so eventHue gives each workspace's meetings a
    // stable colour, like a calendar of their own.
    accountId: `meetings-${meeting.workspaceId}`,
    accountEmail: null,
    calendarId: `meetings-${meeting.workspaceId}`,
    calendarName: `${meeting.workspace.name} meetings`,
    provider: "meeting" as const,
    id: meeting.id,
    summary: meeting.title,
    start: { dateTime: meeting.startsAt.toISOString() },
    end: { dateTime: meeting.endsAt.toISOString() },
    location: meeting.location ?? undefined,
    htmlLink: "",
    status: "confirmed",
  }));
}
