/**
 * Slot suggestion engine (V3 scheduling) — pure.
 *
 * Candidate slots on a fixed increment across the range, keeping those that
 * are (a) free for EVERY attendee with availability data and (b) inside each
 * attendee's time-of-day constraint judged on THEIR wall clock (User.timezone,
 * organizer timezone as fallback). The constraint is the attendee's working
 * hours when enabled; otherwise — and whenever the organizer opts into
 * outside-hours times — it relaxes to the SCHEDULING WINDOW (07:00–20:00,
 * any day), never to 24/7. No code path suggests a 2 AM meeting.
 *
 * Suggestions are spread across the range with a per-day cap (in the
 * organizer's timezone) so a busy first day can't crowd the rest of the week
 * out of the list. Chronological within that; ranking heuristics remain a
 * deliberate non-goal.
 */

import type { BusyBlock } from "./freeBusy";

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

export interface AttendeeWorkSettings {
  workHoursEnabled: boolean;
  /** Lowercase day names, e.g. ["monday", ...]. Empty/absent → Mon–Fri. */
  workDays: string[];
  /** "HH:MM". */
  workHoursStart: string | null;
  workHoursEnd: string | null;
  /** IANA name; null falls back to the organizer's timezone. */
  timezone: string | null;
}

export interface ComputeSlotsInput {
  /** Busy blocks per attendee, from the free/busy contract. */
  busyBlocksByUser: Map<string, BusyBlock[]>;
  /** Work-hours settings per attendee; missing entries get the scheduling window. */
  attendeeSettings?: Map<string, AttendeeWorkSettings>;
  /** Fallback zone for attendees without their own User.timezone. */
  organizerTimezone?: string | null;
  /**
   * Relax every attendee's constraint from their work hours to the
   * scheduling window (the organizer's escape hatch). Never 24/7.
   */
  includeOutsideWorkHours?: boolean;
  durationMinutes: number;
  range: { from: Date; to: Date };
  /** Candidate grid step. */
  incrementMinutes?: number;
  /** Stop after this many suggestions (chronological). */
  maxSlots?: number;
  /** Spread cap: at most this many suggestions per organizer-local day. */
  maxSlotsPerDay?: number;
}

/** The scheduling window: outer bound on suggestions, per-attendee wall clock. */
export const SCHEDULING_WINDOW_START_MINUTES = 7 * 60;
export const SCHEDULING_WINDOW_END_MINUTES = 20 * 60;

const DEFAULT_INCREMENT_MINUTES = 30;
const DEFAULT_MAX_SLOTS = 28;
const DEFAULT_MAX_SLOTS_PER_DAY = 4;
const DEFAULT_WORK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** "09:30" → minutes since local midnight; null on unparseable input. */
function parseHhMm(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes <= 24 * 60 ? minutes : null;
}

// Intl.DateTimeFormat construction is expensive and the loops below call
// wallClock thousands of times per request — cache one formatter per zone.
const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string | null): Intl.DateTimeFormat {
  const key = timeZone ?? "__local__";
  let dtf = wallClockFormatters.get(key);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      ...(timeZone ? { timeZone } : {}),
      hour12: false,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    wallClockFormatters.set(key, dtf);
  }
  return dtf;
}

/** The instant's wall-clock position in `timeZone`: weekday + minutes-of-day. */
function wallClock(date: Date, timeZone: string | null): { weekday: string; minutes: number } {
  const parts = Object.fromEntries(
    wallClockFormatter(timeZone)
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return { weekday: (parts.weekday ?? "").toLowerCase(), minutes: hour * 60 + Number(parts.minute) };
}

/**
 * Whether [startsAt, endsAt) sits inside a daily window judged on the wall
 * clock of `timeZone`. A slot that crosses midnight or leaves the window at
 * either end is out. `days` of null allows every weekday.
 */
function withinDailyWindow(
  startsAt: Date,
  endsAt: Date,
  timeZone: string | null,
  windowStartMinutes: number,
  windowEndMinutes: number,
  days: string[] | null,
): boolean {
  const start = wallClock(startsAt, timeZone);
  const end = wallClock(endsAt, timeZone);

  if (days && !days.includes(start.weekday)) return false;
  if (start.minutes < windowStartMinutes) return false;
  // End on the boundary is fine (a 16:00–17:00 slot for 9-to-5 hours). An
  // end wall-clock earlier than the start means the slot crossed midnight.
  const endOfDayAdjusted = end.minutes === 0 && start.minutes > 0 ? 24 * 60 : end.minutes;
  if (endOfDayAdjusted < start.minutes) return false;
  if (endOfDayAdjusted > windowEndMinutes) return false;

  return true;
}

/**
 * One attendee's resolved time-of-day constraint: their working hours when
 * enabled and not relaxed, else the scheduling window — always clamped to
 * the window, which is the OUTER bound (work hours of 00:00–23:59 must not
 * reopen 2 AM). Judged on their own wall clock (organizer timezone as
 * fallback). The verdict depends only on this constraint, not the attendee's
 * identity, so callers dedupe by `key` before evaluating candidate slots.
 */
interface TimeConstraint {
  timeZone: string | null;
  startMinutes: number;
  endMinutes: number;
  days: string[] | null;
  key: string;
}

function constraintOf(
  settings: AttendeeWorkSettings | undefined,
  organizerTimezone: string | null,
  includeOutsideWorkHours: boolean,
): TimeConstraint {
  const timeZone = settings?.timezone ?? organizerTimezone;
  let startMinutes = SCHEDULING_WINDOW_START_MINUTES;
  let endMinutes = SCHEDULING_WINDOW_END_MINUTES;
  let days: string[] | null = null;
  if (!includeOutsideWorkHours && settings?.workHoursEnabled) {
    startMinutes = Math.max(
      parseHhMm(settings.workHoursStart) ?? 9 * 60,
      SCHEDULING_WINDOW_START_MINUTES,
    );
    endMinutes = Math.min(
      parseHhMm(settings.workHoursEnd) ?? 17 * 60,
      SCHEDULING_WINDOW_END_MINUTES,
    );
    days = settings.workDays.length > 0 ? settings.workDays : DEFAULT_WORK_DAYS;
  }
  return {
    timeZone,
    startMinutes,
    endMinutes,
    days,
    key: `${timeZone ?? ""}|${startMinutes}|${endMinutes}|${days?.join(",") ?? "*"}`,
  };
}

function constraintAllows(startsAt: Date, endsAt: Date, c: TimeConstraint): boolean {
  return withinDailyWindow(startsAt, endsAt, c.timeZone, c.startMinutes, c.endMinutes, c.days);
}

/** Distinct constraints across attendees — most workspaces share a handful. */
function uniqueConstraints(
  attendeeIds: string[],
  attendeeSettings: Map<string, AttendeeWorkSettings> | undefined,
  organizerTimezone: string | null,
  includeOutsideWorkHours: boolean,
): TimeConstraint[] {
  const byKey = new Map<string, TimeConstraint>();
  for (const id of attendeeIds) {
    const constraint = constraintOf(
      attendeeSettings?.get(id),
      organizerTimezone,
      includeOutsideWorkHours,
    );
    byKey.set(constraint.key, constraint);
  }
  return [...byKey.values()];
}

/** "2026-08-18" in `timeZone` — the per-day-cap bucket key. */
function dayKeyInZone(date: Date, timeZone: string | null): string {
  // en-CA formats as YYYY-MM-DD.
  const key = timeZone ?? "__local__";
  let dtf = wallClockFormatters.get(key + "#day");
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-CA", {
      ...(timeZone ? { timeZone } : {}),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    wallClockFormatters.set(key + "#day", dtf);
  }
  return dtf.format(date);
}

export function computeSlots({
  busyBlocksByUser,
  attendeeSettings,
  organizerTimezone = null,
  includeOutsideWorkHours = false,
  durationMinutes,
  range,
  incrementMinutes = DEFAULT_INCREMENT_MINUTES,
  maxSlots = DEFAULT_MAX_SLOTS,
  maxSlotsPerDay = DEFAULT_MAX_SLOTS_PER_DAY,
}: ComputeSlotsInput): Slot[] {
  const durationMs = durationMinutes * 60 * 1000;
  const incrementMs = incrementMinutes * 60 * 1000;

  // One merged busy list — a slot must dodge every attendee's blocks, so
  // whose block it is doesn't matter here.
  const allBusy = [...busyBlocksByUser.values()].flat();
  // Every attendee constrains time-of-day — via work hours or the window.
  // The verdict depends only on the resolved constraint, so evaluate each
  // DISTINCT constraint once per candidate instead of once per attendee.
  const attendeeIds = [
    ...new Set([...busyBlocksByUser.keys(), ...(attendeeSettings?.keys() ?? [])]),
  ];
  const constraints = uniqueConstraints(
    attendeeIds,
    attendeeSettings,
    organizerTimezone,
    includeOutsideWorkHours,
  );

  const slots: Slot[] = [];
  const perDay = new Map<string, number>();
  // Align the grid to the increment so suggestions land on round times.
  const firstAligned = Math.ceil(range.from.getTime() / incrementMs) * incrementMs;

  for (
    let start = firstAligned;
    start + durationMs <= range.to.getTime() && slots.length < maxSlots;
    start += incrementMs
  ) {
    const startsAt = new Date(start);
    const endsAt = new Date(start + durationMs);
    const clashes = allBusy.some((block) =>
      overlaps(startsAt, endsAt, block.startsAt, block.endsAt),
    );
    if (clashes) continue;
    const excluded = constraints.some((c) => !constraintAllows(startsAt, endsAt, c));
    if (excluded) continue;
    const dayKey = dayKeyInZone(startsAt, organizerTimezone);
    const dayCount = perDay.get(dayKey) ?? 0;
    if (dayCount >= maxSlotsPerDay) continue;
    perDay.set(dayKey, dayCount + 1);
    slots.push({ startsAt, endsAt });
  }

  return slots;
}

/**
 * Per-attendee, per-cell availability for the grid view. A cell's status is
 * judged for each attendee independently:
 *   "outside" — fails their time-of-day constraint (work hours or window);
 *   "busy"    — inside the constraint but overlapping one of their blocks;
 *   "free"    — neither.
 * "outside" wins over "busy" because the grid mutes those cells entirely.
 * Availability-unknown attendees read "free" — the CALLER flags them so the
 * UI can label assumed-free honestly.
 */
export type CellStatus = "free" | "busy" | "outside";

export interface ComputeAvailabilityGridInput {
  busyBlocksByUser: Map<string, BusyBlock[]>;
  attendeeSettings?: Map<string, AttendeeWorkSettings>;
  organizerTimezone?: string | null;
  includeOutsideWorkHours?: boolean;
  range: { from: Date; to: Date };
  incrementMinutes?: number;
}

export interface AvailabilityGrid {
  /** Aligned cell starts; every cell spans `cellMinutes`. */
  cellStartsAt: Date[];
  cellMinutes: number;
  attendees: { userId: string; statuses: CellStatus[] }[];
}

// 30-day range at 30-min cells is 1440 — this is a generous safety cap.
const MAX_GRID_CELLS = 3000;

export function computeAvailabilityGrid({
  busyBlocksByUser,
  attendeeSettings,
  organizerTimezone = null,
  includeOutsideWorkHours = false,
  range,
  incrementMinutes = DEFAULT_INCREMENT_MINUTES,
}: ComputeAvailabilityGridInput): AvailabilityGrid {
  const incrementMs = incrementMinutes * 60 * 1000;
  const attendeeIds = [
    ...new Set([...busyBlocksByUser.keys(), ...(attendeeSettings?.keys() ?? [])]),
  ];

  const cellStartsAt: Date[] = [];
  const firstAligned = Math.ceil(range.from.getTime() / incrementMs) * incrementMs;
  for (
    let start = firstAligned;
    start + incrementMs <= range.to.getTime() && cellStartsAt.length < MAX_GRID_CELLS;
    start += incrementMs
  ) {
    cellStartsAt.push(new Date(start));
  }

  // Wall-clock verdicts per DISTINCT constraint (attendees typically share a
  // few timezones/settings), then per-attendee statuses on top of them.
  const allowedByConstraintKey = new Map<string, boolean[]>();
  const attendees = attendeeIds.map((userId) => {
    const blocks = busyBlocksByUser.get(userId) ?? [];
    const constraint = constraintOf(
      attendeeSettings?.get(userId),
      organizerTimezone,
      includeOutsideWorkHours,
    );
    let cached = allowedByConstraintKey.get(constraint.key);
    if (!cached) {
      cached = cellStartsAt.map((startsAt) =>
        constraintAllows(startsAt, new Date(startsAt.getTime() + incrementMs), constraint),
      );
      allowedByConstraintKey.set(constraint.key, cached);
    }
    const allowed = cached;
    const statuses = cellStartsAt.map((startsAt, index): CellStatus => {
      if (!allowed[index]) return "outside";
      const endsAt = new Date(startsAt.getTime() + incrementMs);
      const busy = blocks.some((block) =>
        overlaps(startsAt, endsAt, block.startsAt, block.endsAt),
      );
      return busy ? "busy" : "free";
    });
    return { userId, statuses };
  });

  return { cellStartsAt, cellMinutes: incrementMinutes, attendees };
}
