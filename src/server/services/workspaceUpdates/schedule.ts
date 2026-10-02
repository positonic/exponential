/**
 * When a workspace's weekly update is due. Pure — the caller passes `now` — so
 * the timezone and DST edges are unit-testable.
 *
 * A workspace configures a local weekday + hour in its IANA timezone (e.g.
 * Friday 09:00 Europe/Berlin). The hourly sweep is due for the most recent
 * such instant at or before `now` while it is still within the grace window,
 * so a late or missed sweep still runs, but a stale period is never drafted
 * days afterwards, nor one from before the copywriter was switched on.
 */
import { addDays, startOfDay } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/** How long after its trigger instant a period may still be drafted. */
export const DUE_GRACE_MS = 6 * 60 * 60 * 1000;

export interface WeeklySchedule {
  weekday: number; // 0=Sun … 6=Sat
  hour: number; // 0–23
  timezone: string; // IANA
}

/** The most recent `weekday` at `hour:00` (local to `timezone`) at or before `now`. */
export function latestWeeklyInstant(schedule: WeeklySchedule, now: Date): Date {
  // A Date whose local fields read as the wall clock in `timezone`. An unknown
  // zone yields an Invalid Date rather than throwing; refuse it loudly.
  const local = toZonedTime(now, schedule.timezone);
  if (Number.isNaN(local.getTime())) {
    throw new RangeError(`Unknown time zone: ${schedule.timezone}`);
  }
  const dayDelta = (local.getDay() - schedule.weekday + 7) % 7;
  let candidate = addDays(startOfDay(local), -dayDelta);
  candidate.setHours(schedule.hour, 0, 0, 0);
  if (candidate.getTime() > local.getTime()) candidate = addDays(candidate, -7);
  return fromZonedTime(candidate, schedule.timezone);
}

/** The period's key: the trigger's local date, e.g. "2026-10-02". */
export function weeklyPeriodKey(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
}

/**
 * The instant to draft for at `now`, or null when nothing is due: the latest
 * trigger is older than the grace window, or predates `enabledAt`.
 */
export function dueWeeklyInstant(
  schedule: WeeklySchedule & { enabledAt: Date | null },
  now: Date,
): Date | null {
  const instant = latestWeeklyInstant(schedule, now);
  if (now.getTime() - instant.getTime() >= DUE_GRACE_MS) return null;
  if (!schedule.enabledAt || instant.getTime() < schedule.enabledAt.getTime()) return null;
  return instant;
}
