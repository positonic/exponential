/**
 * Slot suggestion engine (V3 scheduling) — pure.
 *
 * Candidate slots on a fixed increment across the range, keeping those that
 * are (a) free for EVERY attendee with availability data and (b) inside each
 * attendee's working hours interpreted in THEIR timezone (organizer timezone
 * as fallback), unless the organizer opts into outside-hours times.
 * Attendees with no busy blocks contribute no free/busy constraints — the
 * caller flags them availability-unknown — but their work hours still apply
 * when known. Chronological order; ranking heuristics are a deliberate
 * non-goal for V1.
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
  /** Work-hours settings per attendee; missing entries are unconstrained. */
  attendeeSettings?: Map<string, AttendeeWorkSettings>;
  /** Fallback zone for attendees without their own User.timezone. */
  organizerTimezone?: string | null;
  /** Skip the work-hours filter entirely (the organizer's escape hatch). */
  includeOutsideWorkHours?: boolean;
  durationMinutes: number;
  range: { from: Date; to: Date };
  /** Candidate grid step. */
  incrementMinutes?: number;
  /** Stop after this many suggestions (chronological). */
  maxSlots?: number;
}

const DEFAULT_INCREMENT_MINUTES = 30;
const DEFAULT_MAX_SLOTS = 20;
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

/** The instant's wall-clock position in `timeZone`: weekday + minutes-of-day. */
function wallClock(date: Date, timeZone: string | null): { weekday: string; minutes: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    ...(timeZone ? { timeZone } : {}),
    hour12: false,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return { weekday: (parts.weekday ?? "").toLowerCase(), minutes: hour * 60 + Number(parts.minute) };
}

/**
 * Whether [startsAt, endsAt) sits inside one attendee's working hours,
 * judged on their wall clock. A slot that crosses their midnight or leaves
 * their work window at either end is out.
 */
function withinWorkHours(
  startsAt: Date,
  endsAt: Date,
  settings: AttendeeWorkSettings,
  organizerTimezone: string | null,
): boolean {
  if (!settings.workHoursEnabled) return true;

  const startMinutes = parseHhMm(settings.workHoursStart) ?? 9 * 60;
  const endMinutes = parseHhMm(settings.workHoursEnd) ?? 17 * 60;
  const workDays = settings.workDays.length > 0 ? settings.workDays : DEFAULT_WORK_DAYS;
  const timeZone = settings.timezone ?? organizerTimezone;

  const start = wallClock(startsAt, timeZone);
  const end = wallClock(endsAt, timeZone);

  if (!workDays.includes(start.weekday)) return false;
  if (start.minutes < startMinutes) return false;
  // End on the boundary is fine (a 16:00–17:00 slot for 9-to-5 hours). An
  // end wall-clock earlier than the start means the slot crossed midnight.
  const endOfDayAdjusted = end.minutes === 0 && start.minutes > 0 ? 24 * 60 : end.minutes;
  if (endOfDayAdjusted < start.minutes) return false;
  if (endOfDayAdjusted > endMinutes) return false;

  return true;
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
}: ComputeSlotsInput): Slot[] {
  const durationMs = durationMinutes * 60 * 1000;
  const incrementMs = incrementMinutes * 60 * 1000;

  // One merged busy list — a slot must dodge every attendee's blocks, so
  // whose block it is doesn't matter here.
  const allBusy = [...busyBlocksByUser.values()].flat();
  const workConstraints = includeOutsideWorkHours
    ? []
    : [...(attendeeSettings?.values() ?? [])];

  const slots: Slot[] = [];
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
    const outsideSomeonesHours = workConstraints.some(
      (settings) => !withinWorkHours(startsAt, endsAt, settings, organizerTimezone),
    );
    if (outsideSomeonesHours) continue;
    slots.push({ startsAt, endsAt });
  }

  return slots;
}
