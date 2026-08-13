import { describe, expect, it } from "vitest";

import {
  buildWorkingWindows,
  computeCommonFreeSlots,
  mergeIntervals,
  parseBusyIntervals,
  subtractBusy,
  type TimeInterval,
} from "~/server/services/AvailabilityService";

const d = (iso: string) => new Date(iso);

const interval = (start: string, end: string): TimeInterval => ({
  start: d(start),
  end: d(end),
});

describe("parseBusyIntervals", () => {
  const min = d("2026-08-17T00:00:00Z");
  const max = d("2026-08-18T00:00:00Z");

  it("clamps intervals to the query range", () => {
    const result = parseBusyIntervals(
      [{ start: "2026-08-16T22:00:00Z", end: "2026-08-17T01:00:00Z" }],
      min,
      max,
    );
    expect(result).toEqual([interval("2026-08-17T00:00:00Z", "2026-08-17T01:00:00Z")]);
  });

  it("drops malformed, inverted, and out-of-range intervals", () => {
    const result = parseBusyIntervals(
      [
        { start: "not-a-date", end: "2026-08-17T01:00:00Z" },
        { start: "2026-08-17T05:00:00Z", end: "2026-08-17T04:00:00Z" },
        { start: "2026-08-19T00:00:00Z", end: "2026-08-19T01:00:00Z" },
      ],
      min,
      max,
    );
    expect(result).toEqual([]);
  });
});

describe("mergeIntervals", () => {
  it("merges overlapping and touching intervals", () => {
    const result = mergeIntervals([
      interval("2026-08-17T10:00:00Z", "2026-08-17T11:00:00Z"),
      interval("2026-08-17T10:30:00Z", "2026-08-17T12:00:00Z"),
      interval("2026-08-17T12:00:00Z", "2026-08-17T13:00:00Z"),
      interval("2026-08-17T15:00:00Z", "2026-08-17T16:00:00Z"),
    ]);
    expect(result).toEqual([
      interval("2026-08-17T10:00:00Z", "2026-08-17T13:00:00Z"),
      interval("2026-08-17T15:00:00Z", "2026-08-17T16:00:00Z"),
    ]);
  });

  it("does not mutate its input", () => {
    const input = [
      interval("2026-08-17T12:00:00Z", "2026-08-17T13:00:00Z"),
      interval("2026-08-17T10:00:00Z", "2026-08-17T12:30:00Z"),
    ];
    mergeIntervals(input);
    expect(input[0]!.end.toISOString()).toBe("2026-08-17T13:00:00.000Z");
  });
});

describe("subtractBusy", () => {
  const window = interval("2026-08-17T09:00:00Z", "2026-08-17T17:00:00Z");

  it("returns the whole window when nothing is busy", () => {
    expect(subtractBusy(window, [])).toEqual([window]);
  });

  it("splits the window around busy periods", () => {
    const free = subtractBusy(window, [
      interval("2026-08-17T08:00:00Z", "2026-08-17T10:00:00Z"),
      interval("2026-08-17T12:00:00Z", "2026-08-17T13:00:00Z"),
    ]);
    expect(free).toEqual([
      interval("2026-08-17T10:00:00Z", "2026-08-17T12:00:00Z"),
      interval("2026-08-17T13:00:00Z", "2026-08-17T17:00:00Z"),
    ]);
  });

  it("returns nothing when busy covers the window", () => {
    const free = subtractBusy(window, [
      interval("2026-08-17T00:00:00Z", "2026-08-18T00:00:00Z"),
    ]);
    expect(free).toEqual([]);
  });
});

describe("buildWorkingWindows", () => {
  it("builds one UTC window per weekday", () => {
    // Mon 2026-08-17 .. Wed 2026-08-19 in UTC
    const windows = buildWorkingWindows(
      d("2026-08-17T00:00:00Z"),
      d("2026-08-19T23:59:59Z"),
      { timeZone: "UTC", startHour: 9, endHour: 17, includeWeekends: false },
    );
    expect(windows).toEqual([
      interval("2026-08-17T09:00:00Z", "2026-08-17T17:00:00Z"),
      interval("2026-08-18T09:00:00Z", "2026-08-18T17:00:00Z"),
      interval("2026-08-19T09:00:00Z", "2026-08-19T17:00:00Z"),
    ]);
  });

  it("skips weekends unless included", () => {
    // Fri 2026-08-21 .. Mon 2026-08-24
    const range = [d("2026-08-21T00:00:00Z"), d("2026-08-24T23:59:59Z")] as const;
    const weekdaysOnly = buildWorkingWindows(range[0], range[1], {
      timeZone: "UTC",
      startHour: 9,
      endHour: 17,
      includeWeekends: false,
    });
    expect(weekdaysOnly.map((w) => w.start.toISOString())).toEqual([
      "2026-08-21T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
    ]);

    const withWeekends = buildWorkingWindows(range[0], range[1], {
      timeZone: "UTC",
      startHour: 9,
      endHour: 17,
      includeWeekends: true,
    });
    expect(withWeekends).toHaveLength(4);
  });

  it("expresses working hours in the requested time zone", () => {
    // 9:00 in New York on 2026-08-17 (EDT, UTC-4) is 13:00 UTC.
    const windows = buildWorkingWindows(
      d("2026-08-17T00:00:00Z"),
      d("2026-08-18T04:00:00Z"),
      {
        timeZone: "America/New_York",
        startHour: 9,
        endHour: 17,
        includeWeekends: false,
      },
    );
    expect(windows[0]).toEqual(
      interval("2026-08-17T13:00:00Z", "2026-08-17T21:00:00Z"),
    );
  });

  it("clamps the first and last windows to the query range", () => {
    const windows = buildWorkingWindows(
      d("2026-08-17T10:30:00Z"),
      d("2026-08-17T15:00:00Z"),
      { timeZone: "UTC", startHour: 9, endHour: 17, includeWeekends: false },
    );
    expect(windows).toEqual([
      interval("2026-08-17T10:30:00Z", "2026-08-17T15:00:00Z"),
    ]);
  });
});

describe("computeCommonFreeSlots", () => {
  const baseOptions = {
    timeMin: d("2026-08-17T00:00:00Z"), // a Monday
    timeMax: d("2026-08-17T23:59:59Z"),
    durationMinutes: 60,
    slotIncrementMinutes: 30,
    timeZone: "UTC",
    startHour: 9,
    endHour: 12,
    includeWeekends: false,
    maxSlots: 50,
  };

  it("returns every aligned slot when everyone is free", () => {
    const slots = computeCommonFreeSlots([[], []], baseOptions);
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-08-17T09:00:00.000Z",
      "2026-08-17T09:30:00.000Z",
      "2026-08-17T10:00:00.000Z",
      "2026-08-17T10:30:00.000Z",
      "2026-08-17T11:00:00.000Z",
    ]);
  });

  it("only offers slots where all members are free", () => {
    const slots = computeCommonFreeSlots(
      [
        [{ start: "2026-08-17T09:00:00Z", end: "2026-08-17T10:00:00Z" }],
        [{ start: "2026-08-17T11:30:00Z", end: "2026-08-17T12:00:00Z" }],
      ],
      baseOptions,
    );
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-08-17T10:00:00.000Z",
      "2026-08-17T10:30:00.000Z",
    ]);
  });

  it("re-aligns slot starts after a busy period ends mid-increment", () => {
    // Busy until 9:40 → next aligned start (relative to the 9:00 window) is 10:00.
    const slots = computeCommonFreeSlots(
      [[{ start: "2026-08-17T09:00:00Z", end: "2026-08-17T09:40:00Z" }]],
      baseOptions,
    );
    expect(slots[0]!.start.toISOString()).toBe("2026-08-17T10:00:00.000Z");
  });

  it("respects the maxSlots cap", () => {
    const slots = computeCommonFreeSlots([[]], { ...baseOptions, maxSlots: 2 });
    expect(slots).toHaveLength(2);
  });

  it("finds nothing when one member is booked solid", () => {
    const slots = computeCommonFreeSlots(
      [[], [{ start: "2026-08-17T00:00:00Z", end: "2026-08-18T00:00:00Z" }]],
      baseOptions,
    );
    expect(slots).toEqual([]);
  });
});
