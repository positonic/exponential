/**
 * Unit tests for the slot engine: aligned candidates, busy-block exclusion
 * across all attendees, the scheduling window (07:00–20:00 per-attendee wall
 * clock — the floor under every path, escape hatch included), work hours ∩
 * timezones, per-day spread, and the availability grid.
 *
 * organizerTimezone is passed explicitly ("UTC" unless the test is about
 * fallback) so expectations don't depend on the host machine's zone.
 */

import { describe, it, expect } from "vitest";

import { computeSlots, computeAvailabilityGrid } from "../slotEngine";
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
      organizerTimezone: "UTC",
      durationMinutes: 60,
      range: RANGE,
      maxSlotsPerDay: 99,
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
      organizerTimezone: "UTC",
      durationMinutes: 60,
      range: RANGE,
    });

    // 09:00, 09:30 clash with a; 11:00, 11:30 clash with b → only 10:00, 10:30.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-08-18T10:00:00.000Z",
      "2026-08-18T10:30:00.000Z",
    ]);
  });

  it("attendees with no busy data add no free/busy constraints", () => {
    const constrained = computeSlots({
      busyBlocksByUser: new Map([
        ["a", [busy("2026-08-18T09:00:00Z", "2026-08-18T10:00:00Z")]],
      ]),
      organizerTimezone: "UTC",
      durationMinutes: 60,
      range: RANGE,
    });
    const withUnknown = computeSlots({
      busyBlocksByUser: new Map([
        ["a", [busy("2026-08-18T09:00:00Z", "2026-08-18T10:00:00Z")]],
        ["unknown", []],
      ]),
      organizerTimezone: "UTC",
      durationMinutes: 60,
      range: RANGE,
    });

    expect(withUnknown).toEqual(constrained);
  });

  it("never suggests a slot that would run past the range end", () => {
    const slots = computeSlots({
      busyBlocksByUser: new Map([["a", []]]),
      organizerTimezone: "UTC",
      durationMinutes: 120,
      range: RANGE,
    });

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.endsAt.getTime()).toBeLessThanOrEqual(RANGE.to.getTime());
    }
  });

  it("caps the number of suggestions", () => {
    const slots = computeSlots({
      busyBlocksByUser: new Map([["a", []]]),
      organizerTimezone: "UTC",
      durationMinutes: 15,
      range: { from: new Date("2026-08-18T00:00:00Z"), to: new Date("2026-08-25T00:00:00Z") },
      maxSlots: 7,
    });

    expect(slots).toHaveLength(7);
  });

  it("maxSlots and the per-day cap compose — total stops mid-day", () => {
    const slots = computeSlots({
      busyBlocksByUser: new Map([["a", []]]),
      organizerTimezone: "UTC",
      durationMinutes: 60,
      range: { from: new Date("2026-08-18T00:00:00Z"), to: new Date("2026-08-20T00:00:00Z") },
      maxSlots: 6,
      maxSlotsPerDay: 4,
    });

    const byDay = new Map<string, number>();
    for (const slot of slots) {
      const day = slot.startsAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    // 4 on day one (per-day cap), then maxSlots cuts day two at 2.
    expect([...byDay.entries()]).toEqual([
      ["2026-08-18", 4],
      ["2026-08-19", 2],
    ]);
  });

  it("spreads suggestions across days with the per-day cap", () => {
    const slots = computeSlots({
      busyBlocksByUser: new Map([["a", []]]),
      organizerTimezone: "UTC",
      durationMinutes: 60,
      range: { from: new Date("2026-08-18T00:00:00Z"), to: new Date("2026-08-20T00:00:00Z") },
      maxSlotsPerDay: 4,
    });

    // A fully free 2-day range must not spend the whole budget on day one.
    const byDay = new Map<string, number>();
    for (const slot of slots) {
      const day = slot.startsAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    expect([...byDay.entries()]).toEqual([
      ["2026-08-18", 4],
      ["2026-08-19", 4],
    ]);
  });

  describe("scheduling window (07:00–20:00, per-attendee wall clock)", () => {
    // Tue 2026-08-18, whole day UTC.
    const DAY_RANGE = {
      from: new Date("2026-08-18T00:00:00Z"),
      to: new Date("2026-08-19T00:00:00Z"),
    };

    it("attendees without settings are clamped to the window, not unconstrained", () => {
      const slots = computeSlots({
        busyBlocksByUser: new Map([["a", []]]),
        organizerTimezone: "UTC",
        durationMinutes: 60,
        range: DAY_RANGE,
        maxSlotsPerDay: 99,
        maxSlots: 99,
      });

      expect(slots[0]!.startsAt.toISOString()).toBe("2026-08-18T07:00:00.000Z");
      expect(slots.at(-1)!.endsAt.toISOString()).toBe("2026-08-18T20:00:00.000Z");
    });

    it("work hours disabled means the window applies in the attendee's zone", () => {
      // Berlin (UTC+2 in August): window 07:00–20:00 local = 05:00–18:00Z.
      const slots = computeSlots({
        busyBlocksByUser: new Map([["a", []]]),
        attendeeSettings: new Map([
          [
            "a",
            {
              workHoursEnabled: false,
              workDays: [],
              workHoursStart: null,
              workHoursEnd: null,
              timezone: "Europe/Berlin",
            },
          ],
        ]),
        organizerTimezone: "UTC",
        durationMinutes: 60,
        range: DAY_RANGE,
        maxSlotsPerDay: 99,
        maxSlots: 99,
      });

      expect(slots[0]!.startsAt.toISOString()).toBe("2026-08-18T05:00:00.000Z");
      expect(slots.at(-1)!.endsAt.toISOString()).toBe("2026-08-18T18:00:00.000Z");
    });

    it("work hours wider than the window are clamped — the window is the OUTER bound", () => {
      // 00:00–23:59 "work hours" must not reopen 2 AM.
      const slots = computeSlots({
        busyBlocksByUser: new Map([["a", []]]),
        attendeeSettings: new Map([
          [
            "a",
            {
              workHoursEnabled: true,
              workDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
              workHoursStart: "00:00",
              workHoursEnd: "23:59",
              timezone: "UTC",
            },
          ],
        ]),
        organizerTimezone: "UTC",
        durationMinutes: 60,
        range: DAY_RANGE,
        maxSlotsPerDay: 99,
        maxSlots: 99,
      });

      expect(slots[0]!.startsAt.toISOString()).toBe("2026-08-18T07:00:00.000Z");
      expect(slots.at(-1)!.endsAt.toISOString()).toBe("2026-08-18T20:00:00.000Z");
    });

    it("the escape hatch relaxes to the window, never to 24/7", () => {
      const nineToFive = (timezone: string) => ({
        workHoursEnabled: true,
        workDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        workHoursStart: "09:00",
        workHoursEnd: "17:00",
        timezone,
      });
      // Berlin window = 05:00–18:00Z; LA (UTC-7) window = 14:00–03:00Z.
      // Their work hours don't intersect at all; their windows do: 14:00–18:00Z.
      const slots = computeSlots({
        busyBlocksByUser: new Map([
          ["berlin", []],
          ["la", []],
        ]),
        attendeeSettings: new Map([
          ["berlin", nineToFive("Europe/Berlin")],
          ["la", nineToFive("America/Los_Angeles")],
        ]),
        organizerTimezone: "UTC",
        includeOutsideWorkHours: true,
        durationMinutes: 60,
        range: DAY_RANGE,
        maxSlotsPerDay: 99,
        maxSlots: 99,
      });

      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]!.startsAt.toISOString()).toBe("2026-08-18T14:00:00.000Z");
      expect(slots.at(-1)!.endsAt.toISOString()).toBe("2026-08-18T18:00:00.000Z");
    });
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
        organizerTimezone: "UTC",
        durationMinutes: 60,
        range: DAY_RANGE,
        maxSlotsPerDay: 99,
        maxSlots: 99,
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
        organizerTimezone: "UTC",
        durationMinutes: 60,
        range: DAY_RANGE,
      });

      expect(slots).toHaveLength(0);
    });

    it("excludes non-work days in the attendee's zone", () => {
      // Sat 2026-08-22 UTC — a Mon–Fri attendee blocks the whole day.
      const slots = computeSlots({
        busyBlocksByUser: new Map([["a", []]]),
        attendeeSettings: new Map([["a", nineToFive("Europe/Berlin")]]),
        organizerTimezone: "UTC",
        durationMinutes: 60,
        range: {
          from: new Date("2026-08-22T00:00:00Z"),
          to: new Date("2026-08-23T00:00:00Z"),
        },
      });

      expect(slots).toHaveLength(0);
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

describe("computeAvailabilityGrid", () => {
  it("reports free/busy/outside per attendee per cell", () => {
    const grid = computeAvailabilityGrid({
      busyBlocksByUser: new Map([
        ["a", [busy("2026-08-18T08:00:00Z", "2026-08-18T09:00:00Z")]],
      ]),
      organizerTimezone: "UTC",
      range: {
        from: new Date("2026-08-18T06:00:00Z"),
        to: new Date("2026-08-18T10:00:00Z"),
      },
    });

    expect(grid.cellMinutes).toBe(30);
    expect(grid.cellStartsAt.map((d) => d.toISOString())).toEqual([
      "2026-08-18T06:00:00.000Z",
      "2026-08-18T06:30:00.000Z",
      "2026-08-18T07:00:00.000Z",
      "2026-08-18T07:30:00.000Z",
      "2026-08-18T08:00:00.000Z",
      "2026-08-18T08:30:00.000Z",
      "2026-08-18T09:00:00.000Z",
      "2026-08-18T09:30:00.000Z",
    ]);
    expect(grid.attendees).toHaveLength(1);
    // 06:00/06:30 are before the window; 08:00/08:30 are busy.
    expect(grid.attendees[0]!.statuses).toEqual([
      "outside",
      "outside",
      "free",
      "free",
      "busy",
      "busy",
      "free",
      "free",
    ]);
  });

  it("outside wins over busy — muted cells stay muted even when clashing", () => {
    const grid = computeAvailabilityGrid({
      busyBlocksByUser: new Map([
        ["a", [busy("2026-08-18T07:00:00Z", "2026-08-18T08:00:00Z")]],
      ]),
      attendeeSettings: new Map([
        [
          "a",
          {
            workHoursEnabled: true,
            workDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            workHoursStart: "09:00",
            workHoursEnd: "17:00",
            timezone: "UTC",
          },
        ],
      ]),
      organizerTimezone: "UTC",
      range: {
        from: new Date("2026-08-18T07:00:00Z"),
        to: new Date("2026-08-18T08:00:00Z"),
      },
    });

    expect(grid.attendees[0]!.statuses).toEqual(["outside", "outside"]);
  });

  it("judges each attendee independently", () => {
    const grid = computeAvailabilityGrid({
      busyBlocksByUser: new Map([
        ["busy-one", [busy("2026-08-18T10:00:00Z", "2026-08-18T11:00:00Z")]],
        ["free-one", []],
      ]),
      organizerTimezone: "UTC",
      range: {
        from: new Date("2026-08-18T10:00:00Z"),
        to: new Date("2026-08-18T11:00:00Z"),
      },
    });

    const byUser = new Map(grid.attendees.map((a) => [a.userId, a.statuses]));
    expect(byUser.get("busy-one")).toEqual(["busy", "busy"]);
    expect(byUser.get("free-one")).toEqual(["free", "free"]);
  });
});
