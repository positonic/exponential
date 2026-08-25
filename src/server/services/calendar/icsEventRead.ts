/**
 * Read path for persisted ICS feed events, shaped like the provider
 * services' CalendarEvent payloads so every multi-calendar surface can merge
 * them without caring where they came from. Owner-only — cross-user reads
 * (V2 free/busy) use a different, stripped select.
 */

import type { PrismaClient } from "@prisma/client";

export interface IcsCalendarEvent {
  accountId: string;
  accountEmail: string | null;
  calendarId: string;
  calendarName?: string;
  provider: "ics";
  id: string;
  summary: string;
  /** Not persisted for ICS events; present for CalendarEvent shape parity. */
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  htmlLink: string;
  status: string;
}

/**
 * The owner's ICS events overlapping [timeMin, timeMax), enabled feeds only.
 * The feed id doubles as `calendarId`/`accountId`, which keeps eventHue
 * stable per feed. All-day rows are stored at UTC midnight of the calendar
 * date, so the date-string slice below is exact.
 */
export async function listIcsCalendarEvents(
  db: PrismaClient,
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<IcsCalendarEvent[]> {
  const rows = await db.calendarEvent.findMany({
    where: {
      userId,
      sourceType: "ics",
      startsAt: { lt: timeMax },
      endsAt: { gt: timeMin },
      calendarFeed: { isEnabled: true },
    },
    select: {
      id: true,
      calendarFeedId: true,
      title: true,
      location: true,
      startsAt: true,
      endsAt: true,
      isAllDay: true,
      calendarFeed: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  return rows.map((row) => ({
    accountId: row.calendarFeedId ?? "ics",
    accountEmail: null,
    calendarId: row.calendarFeedId ?? "ics",
    calendarName: row.calendarFeed?.name,
    provider: "ics" as const,
    id: row.id,
    summary: row.title ?? "(untitled)",
    start: row.isAllDay
      ? { date: row.startsAt.toISOString().slice(0, 10) }
      : { dateTime: row.startsAt.toISOString() },
    end: row.isAllDay
      ? { date: row.endsAt.toISOString().slice(0, 10) }
      : { dateTime: row.endsAt.toISOString() },
    location: row.location ?? undefined,
    htmlLink: "",
    status: "confirmed",
  }));
}
