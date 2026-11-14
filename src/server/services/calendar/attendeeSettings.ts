import type { PrismaClient } from "@prisma/client";
import type { AttendeeWorkSettings } from "./slotEngine";

/**
 * Work-hours settings for a set of users (self-describing fields, not event
 * data — no privacy concern) plus the organizer's timezone, the fallback
 * zone for attendees who never set one.
 */
export async function loadAttendeeSettings(
  db: PrismaClient,
  attendeeUserIds: string[],
  organizerId: string,
): Promise<{ attendeeSettings: Map<string, AttendeeWorkSettings>; organizerTimezone: string | null }> {
  const [attendeeRows, organizerRow] = await Promise.all([
    db.user.findMany({
      where: { id: { in: attendeeUserIds } },
      select: {
        id: true,
        workHoursEnabled: true,
        workDaysJson: true,
        workHoursStart: true,
        workHoursEnd: true,
        timezone: true,
      },
    }),
    db.user.findUnique({
      where: { id: organizerId },
      select: { timezone: true },
    }),
  ]);
  const attendeeSettings = new Map<string, AttendeeWorkSettings>(
    attendeeRows.map((row) => {
      let workDays: string[] = [];
      if (row.workDaysJson) {
        try {
          workDays = (JSON.parse(row.workDaysJson) as string[]).map((d) => d.toLowerCase());
        } catch {
          workDays = [];
        }
      }
      return [
        row.id,
        {
          workHoursEnabled: row.workHoursEnabled,
          workDays,
          workHoursStart: row.workHoursStart,
          workHoursEnd: row.workHoursEnd,
          timezone: row.timezone,
        },
      ] as const;
    }),
  );
  return { attendeeSettings, organizerTimezone: organizerRow?.timezone ?? null };
}
