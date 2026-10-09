import { addDays, startOfDay } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * The slice of a calendar event the digest needs. Structurally compatible with
 * `CalendarEvent` from the multi-calendar merge (Google, Microsoft, ICS feeds
 * and Scheduled meetings), so the real reader needs no adapter.
 */
export interface CalendarEventLike {
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}

/**
 * Reads a user's merged calendar for `[timeMin, timeMax)`. Injected into the
 * builder so unit tests never reach an external provider; the production
 * default is `getEventsMultiCalendar`.
 */
export type CalendarReader = (
  userId: string,
  timeMin: Date,
  timeMax: Date,
) => Promise<CalendarEventLike[]>;

/** A calendar event resolved onto one local day. */
export interface DayEvent {
  title: string;
  /** Instants for timed events; null for all-day events. */
  start: Date | null;
  end: Date | null;
  /** `HH:mm` in the user's timezone; null for all-day events. */
  startLocal: string | null;
}

export interface SummaryWindow {
  /** `yyyy-MM-dd` keys of the two local days the digest covers. */
  yesterdayKey: string;
  todayKey: string;
  /** UTC instants bounding `[yesterday 00:00, tomorrow 00:00)` local. */
  yesterdayStart: Date;
  todayStart: Date;
  tomorrowStart: Date;
}

/**
 * The two-local-day window the digest covers, in the user's timezone: one
 * range for the single calendar read (yesterday and today together — external
 * providers are queried once per user per build) plus the day keys used to
 * split the results.
 */
export function summaryWindow(now: Date, tz: string): SummaryWindow {
  const dayStartLocal = startOfDay(toZonedTime(now, tz));
  const yesterdayLocal = addDays(dayStartLocal, -1);
  const tomorrowLocal = addDays(dayStartLocal, 1);
  return {
    yesterdayKey: formatInTimeZone(fromZonedTime(yesterdayLocal, tz), tz, "yyyy-MM-dd"),
    todayKey: formatInTimeZone(fromZonedTime(dayStartLocal, tz), tz, "yyyy-MM-dd"),
    yesterdayStart: fromZonedTime(yesterdayLocal, tz),
    todayStart: fromZonedTime(dayStartLocal, tz),
    tomorrowStart: fromZonedTime(tomorrowLocal, tz),
  };
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Events that fall on the local day `dayKey` (`yyyy-MM-dd` in `tz`), ordered
 * by start: all-day events first (they have no time), then timed events by
 * their instant. A timed event belongs to the local day its start falls on; an
 * all-day event (`start.date`) belongs to every day in `[start.date, end.date)`
 * — `end.date` is exclusive per the calendar convention — or to `start.date`
 * alone when it has no end.
 */
export function eventsOnLocalDay(
  events: CalendarEventLike[],
  dayKey: string,
  tz: string,
): DayEvent[] {
  const allDay: DayEvent[] = [];
  const timed: DayEvent[] = [];

  for (const event of events) {
    const title = event.summary?.trim() ? event.summary.trim() : "(untitled)";
    const startDateTime = parseInstant(event.start?.dateTime);

    if (startDateTime) {
      if (formatInTimeZone(startDateTime, tz, "yyyy-MM-dd") !== dayKey) continue;
      timed.push({
        title,
        start: startDateTime,
        end: parseInstant(event.end?.dateTime),
        startLocal: formatInTimeZone(startDateTime, tz, "HH:mm"),
      });
      continue;
    }

    const startDate = event.start?.date;
    if (!startDate) continue;
    const endDate = event.end?.date;
    const onDay = endDate
      ? startDate <= dayKey && dayKey < endDate
      : startDate === dayKey;
    if (!onDay) continue;
    allDay.push({ title, start: null, end: null, startLocal: null });
  }

  timed.sort((a, b) => a.start!.getTime() - b.start!.getTime());
  return [...allDay, ...timed];
}
