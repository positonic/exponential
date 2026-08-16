/**
 * Unit tests for the availability-grid model: cell placement derived from
 * the server's instants (host-timezone-agnostic by construction — cells are
 * built with the local-time Date constructor), and span-state judgement
 * (contiguity, busy union, outside precedence).
 */

import { describe, it, expect } from "vitest";

import {
  buildGridLayout,
  computeSpanState,
  type GridAttendee,
} from "../availabilityGridModel";

/** Local-time cell — layout buckets by local wall clock, so this is exact. */
const local = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 7, day, hours, minutes);

describe("buildGridLayout", () => {
  it("buckets cells into local days and window rows", () => {
    const cells = [
      local(18, 6, 30), // before the window — indexed but not a row
      local(18, 7, 0),
      local(18, 7, 30),
      local(18, 19, 30), // last row that fits (ends 20:00)
      local(19, 7, 0),
    ];
    const layout = buildGridLayout(cells, 30);

    expect(layout.days.map((d) => d.date.getDate())).toEqual([18, 19]);
    expect(layout.rowMinutes).toEqual([7 * 60, 7 * 60 + 30, 19 * 60 + 30]);

    const day18 = layout.days[0]!.key;
    expect(layout.indexAt(day18, 7 * 60)).toBe(1);
    expect(layout.indexAt(day18, 19 * 60 + 30)).toBe(3);
    expect(layout.indexAt(day18, 12 * 60)).toBeUndefined();
  });

  it("keeps off-half-hour rows (offset-timezone wall clocks)", () => {
    // In a :45-offset zone, UTC-aligned cells land at :15/:45 local. The
    // layout must place them, not drop them.
    const cells = [local(18, 7, 15), local(18, 7, 45)];
    const layout = buildGridLayout(cells, 30);

    expect(layout.rowMinutes).toEqual([7 * 60 + 15, 7 * 60 + 45]);
    expect(layout.indexAt(layout.days[0]!.key, 7 * 60 + 15)).toBe(0);
  });
});

describe("computeSpanState", () => {
  const cells = [local(18, 9, 0), local(18, 9, 30), local(18, 10, 0)];
  const attendee = (userId: string, statuses: GridAttendee["statuses"]): GridAttendee => ({
    userId,
    statuses,
  });

  it("unions busy attendees across the whole span", () => {
    const state = computeSpanState(0, cells, 30, 2, [
      attendee("a", ["busy", "free", "free"]),
      attendee("b", ["free", "busy", "free"]),
      attendee("c", ["free", "free", "busy"]),
    ]);

    expect(state.kind).toBe("open");
    expect(state.busyUserIds.sort()).toEqual(["a", "b"]);
    expect(state.freeCount).toBe(1);
  });

  it("outside for any attendee anywhere in the span mutes the slot", () => {
    const state = computeSpanState(0, cells, 30, 2, [
      attendee("a", ["free", "outside", "free"]),
      attendee("b", ["busy", "free", "free"]),
    ]);

    expect(state.kind).toBe("outside");
  });

  it("a span running off the loaded range is unloaded", () => {
    const state = computeSpanState(2, cells, 30, 2, [attendee("a", ["free", "free", "free"])]);
    expect(state.kind).toBe("unloaded");
  });

  it("a span crossing a gap in the cells is unloaded, not silently shortened", () => {
    const gappy = [local(18, 9, 0), local(18, 11, 0)];
    const state = computeSpanState(0, gappy, 30, 2, [attendee("a", ["free", "free"])]);
    expect(state.kind).toBe("unloaded");
  });

  it("an undefined start index is unloaded", () => {
    expect(computeSpanState(undefined, cells, 30, 1, []).kind).toBe("unloaded");
  });
});
