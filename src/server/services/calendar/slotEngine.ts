/**
 * Slot suggestion engine (V3 scheduling) — pure.
 *
 * V1 of the engine: candidate slots on a fixed increment across the range,
 * keeping those free for EVERY attendee with availability data. Attendees
 * with no busy blocks contribute no constraints — the caller flags them
 * availability-unknown; they never shrink the result. Work-hours ∩ timezone
 * filtering layers on next.
 */

import type { BusyBlock } from "./freeBusy";

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

export interface ComputeSlotsInput {
  /** Busy blocks per attendee, from the free/busy contract. */
  busyBlocksByUser: Map<string, BusyBlock[]>;
  durationMinutes: number;
  range: { from: Date; to: Date };
  /** Candidate grid step. */
  incrementMinutes?: number;
  /** Stop after this many suggestions (chronological). */
  maxSlots?: number;
}

const DEFAULT_INCREMENT_MINUTES = 30;
const DEFAULT_MAX_SLOTS = 20;

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function computeSlots({
  busyBlocksByUser,
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
    if (!clashes) slots.push({ startsAt, endsAt });
  }

  return slots;
}
