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

  describe("work hours ∩ timezones", () => {
    const nineToFive = (timezone: string | null) => ({
      workHoursEnabled: true,
      workDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      workHoursStart: "09:00",
      workHoursEnd: "17:00",
      timezone,
    });

    // Tue 2026-08-18, whole day UTC.
    const DAY_RANGE = {
      from: new Date("2026-08-18T00:00:00Z"),
      to: new Date("2026-08-19T00:00:00Z"),
    };

    it("clamps slots to an attendee's hours in THEIR timezone", () => {
      // Berlin (UTC+2 in August): 9–17 local = 07:00–15:00Z.
      const slots = computeSlots({
        busyBlocksByUser: new Map([["a", []]]),
        attendeeSettings: new Map([["a", nineToFive("Europe/Berlin")]]),
        durationMinutes: 60,
        range: DAY_RANGE,
      });

      expect(slots[0]!.startsAt.toISOString()).toBe("2026-08-18T07:00:00.000Z");
      expect(slots.at(-1)!.endsAt.toISOString()).toBe("2026-08-18T15:00:00.000Z");
    });

    it("intersects two attendees' hours across timezones", () => {
      // Berlin 9–17 = 07:00–15:00Z; Los Angeles (UTC-7) 9–17 = 16:00–24:00Z.
      // No overlap on this day → no slots.
      const slots = computeSlots({
        busyBlocksByUser: new Map([
          ["berlin", []],
          ["la", []],
        ]),
        attendeeSettings: new Map([
          ["berlin", nineToFive("Europe/Berlin")],
          ["la", nineToFive("America/Los_Angeles")],
        ]),
        durationMinutes: 60,
        range: DAY_RANGE,
      });

      expect(slots).toHaveLength(0);
    });

    it("the outside-hours escape hatch bypasses the filter", () => {
      const slots = computeSlots({
        busyBlocksByUser: new Map([
          ["berlin", []],
          ["la", []],
        ]),
        attendeeSettings: new Map([
          ["berlin", nineToFive("Europe/Berlin")],
          ["la", nineToFive("America/Los_Angeles")],
        ]),
        includeOutsideWorkHours: true,
        durationMinutes: 60,
        range: DAY_RANGE,
        maxSlots: 5,
      });

      expect(slots).toHaveLength(5);
    });

    it("excludes non-work days in the attendee's zone", () => {
      // Sat 2026-08-22 UTC — a Mon–Fri attendee blocks the whole day.
      const slots = computeSlots({
        busyBlocksByUser: new Map([["a", []]]),
        attendeeSettings: new Map([["a", nineToFive("Europe/Berlin")]]),
        durationMinutes: 60,
        range: {
          from: new Date("2026-08-22T00:00:00Z"),
          to: new Date("2026-08-23T00:00:00Z"),
        },
      });

      expect(slots).toHaveLength(0);
    });

    it("attendees with work hours disabled are unconstrained", () => {
      const slots = computeSlots({
        busyBlocksByUser: new Map([["a", []]]),
        attendeeSettings: new Map([
          ["a", { ...nineToFive("Europe/Berlin"), workHoursEnabled: false }],
        ]),
        durationMinutes: 60,
        range: DAY_RANGE,
      });

      // Full UTC day on a 30-min grid, capped at the default 20.
      expect(slots).toHaveLength(20);
      expect(slots[0]!.startsAt.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    });

    it("falls back to the organizer's timezone when the attendee has none", () => {
      const slots = computeSlots({
        busyBlocksByUser: new Map([["a", []]]),
        attendeeSettings: new Map([["a", nineToFive(null)]]),
        organizerTimezone: "Europe/Berlin",
        durationMinutes: 60,
        range: DAY_RANGE,
      });

      expect(slots[0]!.startsAt.toISOString()).toBe("2026-08-18T07:00:00.000Z");
    });
  });
});
