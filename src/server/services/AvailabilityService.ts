/**
 * Pure interval math for the team availability checker.
 *
 * Takes per-member busy intervals (already stripped of event details by the
 * calendar providers) and computes the time slots where everyone is free,
 * constrained to working hours in a given IANA time zone.
 *
 * Everything here is deterministic and side-effect free — see
 * `__tests__/AvailabilityService.test.ts`.
 */

import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { BusyInterval } from "./CalendarProvider";

export interface TimeInterval {
  start: Date;
  end: Date;
}

export interface WorkingWindow extends TimeInterval {
  /**
   * The unclamped local-day window start (e.g. 09:00 local) that slot starts
   * align to. When the window itself is clamped to timeMin ("from now on"),
   * aligning to the anchor keeps slots on clean :00/:30 boundaries instead of
   * offsets of the moment the user happened to search.
   */
  anchor: Date;
}

export interface WorkingHoursOptions {
  /** IANA time zone the working hours are expressed in, e.g. "Europe/Lisbon" */
  timeZone: string;
  /** Local hour the workday starts (0–23) */
  startHour: number;
  /** Local hour the workday ends (1–24, exclusive) */
  endHour: number;
  includeWeekends: boolean;
}

export interface FreeSlotOptions extends WorkingHoursOptions {
  timeMin: Date;
  timeMax: Date;
  durationMinutes: number;
  /** Candidate slots start every N minutes within a free gap */
  slotIncrementMinutes: number;
  maxSlots: number;
}

/** Parse provider busy intervals, dropping malformed or inverted ones and clamping to [clampMin, clampMax]. */
export function parseBusyIntervals(
  busy: BusyInterval[],
  clampMin: Date,
  clampMax: Date,
): TimeInterval[] {
  const result: TimeInterval[] = [];
  for (const interval of busy) {
    const start = new Date(interval.start);
    const end = new Date(interval.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const clampedStart = start < clampMin ? clampMin : start;
    const clampedEnd = end > clampMax ? clampMax : end;
    if (clampedStart >= clampedEnd) continue;
    result.push({ start: clampedStart, end: clampedEnd });
  }
  return result;
}

/** Merge overlapping or touching intervals into a sorted, disjoint list. */
export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: TimeInterval[] = [{ ...sorted[0]! }];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/**
 * The working-hour windows (one per qualifying day) between timeMin and
 * timeMax, expressed as UTC instants. Days and hours are evaluated in the
 * given time zone, so a 9–17 window in Europe/Lisbon lands at the right UTC
 * offsets on both sides of a DST switch.
 */
export function buildWorkingWindows(
  timeMin: Date,
  timeMax: Date,
  options: WorkingHoursOptions,
): WorkingWindow[] {
  const { timeZone, startHour, endHour, includeWeekends } = options;
  const windows: WorkingWindow[] = [];

  const pad = (h: number) => String(h).padStart(2, "0");

  // Iterate local days. Anchoring the cursor at local noon keeps addDays from
  // skipping or repeating a day across DST transitions.
  let cursor = timeMin;
  // Generous bound: the router caps the range well below this.
  for (let i = 0; i < 100; i++) {
    const dayStr = formatInTimeZone(cursor, timeZone, "yyyy-MM-dd");
    const isoDayOfWeek = Number(formatInTimeZone(cursor, timeZone, "i"));

    if (includeWeekends || isoDayOfWeek <= 5) {
      const windowStart = fromZonedTime(`${dayStr}T${pad(startHour)}:00:00`, timeZone);
      const windowEnd =
        endHour === 24
          ? fromZonedTime(
              `${formatInTimeZone(addDays(fromZonedTime(`${dayStr}T12:00:00`, timeZone), 1), timeZone, "yyyy-MM-dd")}T00:00:00`,
              timeZone,
            )
          : fromZonedTime(`${dayStr}T${pad(endHour)}:00:00`, timeZone);

      const start = windowStart < timeMin ? timeMin : windowStart;
      const end = windowEnd > timeMax ? timeMax : windowEnd;
      if (start < end) windows.push({ start, end, anchor: windowStart });
    }

    const localNoon = fromZonedTime(`${dayStr}T12:00:00`, timeZone);
    cursor = addDays(localNoon, 1);
    if (cursor >= timeMax) break;
  }

  return windows;
}

/** The sub-intervals of `window` not covered by any of the (merged, sorted) busy intervals. */
export function subtractBusy(
  window: TimeInterval,
  mergedBusy: TimeInterval[],
): TimeInterval[] {
  const free: TimeInterval[] = [];
  let cursor = window.start;
  for (const busy of mergedBusy) {
    if (busy.end <= cursor) continue;
    if (busy.start >= window.end) break;
    if (busy.start > cursor) {
      free.push({ start: cursor, end: busy.start });
    }
    if (busy.end > cursor) cursor = busy.end;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

/**
 * Slots of `durationMinutes` where none of the members are busy, within
 * working hours. Slot starts are aligned to `slotIncrementMinutes` boundaries
 * measured from each working window's anchor (its unclamped local-day start),
 * so a 9:00–17:00 window with a 30-minute increment yields 9:00, 9:30, …
 * starts — even when the search begins mid-day.
 */
export function computeCommonFreeSlots(
  busyByMember: BusyInterval[][],
  options: FreeSlotOptions,
): TimeInterval[] {
  const { timeMin, timeMax, durationMinutes, slotIncrementMinutes, maxSlots } =
    options;

  const allBusy = busyByMember.flatMap((memberBusy) =>
    parseBusyIntervals(memberBusy, timeMin, timeMax),
  );
  const mergedBusy = mergeIntervals(allBusy);
  const windows = buildWorkingWindows(timeMin, timeMax, options);

  const incrementMs = slotIncrementMinutes * 60 * 1000;
  const slots: TimeInterval[] = [];

  for (const window of windows) {
    for (const gap of subtractBusy(window, mergedBusy)) {
      // First aligned slot start at or after the gap start.
      const offsetMs = gap.start.getTime() - window.anchor.getTime();
      const alignedOffsetMs = Math.ceil(offsetMs / incrementMs) * incrementMs;
      let slotStart = new Date(window.anchor.getTime() + alignedOffsetMs);

      while (true) {
        const slotEnd = addMinutes(slotStart, durationMinutes);
        if (slotEnd > gap.end) break;
        slots.push({ start: slotStart, end: slotEnd });
        if (slots.length >= maxSlots) return slots;
        slotStart = new Date(slotStart.getTime() + incrementMs);
      }
    }
  }

  return slots;
}
