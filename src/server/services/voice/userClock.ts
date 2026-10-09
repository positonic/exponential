import { formatInTimeZone } from "date-fns-tz";

/**
 * The user's local clock, as a system note. zoe's own prompt only knows
 * today's date in UTC, so without this "yesterday" / "on Friday" resolve to UTC
 * days — wrong for anyone far from UTC, and wrong for everyone east of it late
 * in the evening. zoe's calendar and meeting tools take explicit date ranges, so
 * telling zoe the local date is what makes those ranges the user's days.
 */
export function userClockNote(timezone: string, now: Date): string {
  const local = formatInTimeZone(now, timezone, "EEEE d MMMM yyyy, HH:mm");
  const offset = formatInTimeZone(now, timezone, "xxx");
  return `The user's timezone is ${timezone} (UTC${offset}). Their local date and time right now is ${local}.
- Resolve "today", "yesterday", "tomorrow", weekday names and "this/last week" against THIS local date, not UTC.
- When a tool takes a date range for a local day, cover that whole local day (e.g. startDate/endDate as that day's local midnight-to-midnight expressed in ISO with the offset ${offset}).`;
}
