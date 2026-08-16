/**
 * Unit tests for the V1 slot engine: aligned candidates, busy-block
 * exclusion across all attendees, and non-constraining unknown attendees.
 */

import { describe, it, expect } from "vitest";

import { computeSlots } from "../slotEngine";
import type { BusyBlock } from "../freeBusy";

const RANGE = {
  from: new Date("2026-08-18T09:00:00Z"),
  to: new Date("2026-08-18T12:00:00Z"),
};

function busy(startIso: string, endIso: string): BusyBlock {
  return {
    startsAt: new Date(startIso),
    endsAt: new Date(endIso),
    isAllDay: false,
    sourceType: "microsoft",
  };
}

describe("computeSlots", () => {
  it("suggests aligned slots across a free range", () => {
    const slots = computeSlots({
      busyBlocksByUser: new Map([["a", []]]),
      durationMinutes: 60,
      range: RANGE,
    });

    expect(slots[0]!.startsAt.toISOString()).toBe("2026-08-18T09:00:00.000Z");
    expect(slots[0]!.endsAt.toISOString()).toBe("2026-08-18T10:00:00.000Z");
    // 30-min grid, 60-min duration, 3h range → 09:00…11:00 starts.
    expect(slots).toHaveLength(5);
    expect(slots.at(-1)!.startsAt.toISOString()).toBe("2026-08-18T11:00:00.000Z");
  });

  it("drops slots clashing with ANY attendee's busy block", () => {
    const slots = computeSlots({
      busyBlocksByUser: new Map([
        ["a", [busy("2026-08-18T09:00:00Z", "2026-08-18T10:00:00Z")]],
        ["b", [busy("2026-08-18T11:30:00Z", "2026-08-18T12:00:00Z")]],
      ]),
      durationMinutes: 60,
      range: RANGE,
    });

    // 09:00, 09:30 clash with a; 11:00, 11:30 clash with b → only 10:00, 10:30.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-08-18T10:00:00.000Z",
      "2026-08-18T10:30:00.000Z",
    ]);
  });

  it("attendees with no data add no constraints", () => {
    const constrained = computeSlots({
      busyBlocksByUser: new Map([
        ["a", [busy("2026-08-18T09:00:00Z", "2026-08-18T10:00:00Z")]],
      ]),
      durationMinutes: 60,
      range: RANGE,
    });
    const withUnknown = computeSlots({
      busyBlocksByUser: new Map([
        ["a", [busy("2026-08-18T09:00:00Z", "2026-08-18T10:00:00Z")]],
        ["unknown", []],
      ]),
      durationMinutes: 60,
      range: RANGE,
    });

    expect(withUnknown).toEqual(constrained);
  });

  it("never suggests a slot that would run past the range end", () => {
    const slots = computeSlots({
      busyBlocksByUser: new Map(),
      durationMinutes: 120,
      range: RANGE,
    });

    for (const slot of slots) {
      expect(slot.endsAt.getTime()).toBeLessThanOrEqual(RANGE.to.getTime());
    }
  });

  it("caps the number of suggestions", () => {
    const slots = computeSlots({
      busyBlocksByUser: new Map(),
      durationMinutes: 15,
      range: { from: new Date("2026-08-18T00:00:00Z"), to: new Date("2026-08-25T00:00:00Z") },
      maxSlots: 7,
    });

    expect(slots).toHaveLength(7);
  });
});
