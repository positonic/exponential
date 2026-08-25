/**
 * Unit tests for the user-timezone "today" window. The interesting cases are
 * far-from-UTC zones, where UTC's day and the user's day disagree.
 */

import { describe, it, expect } from "vitest";

import { todayWindow } from "../todayWindow";

describe("todayWindow", () => {
  it("puts a 22:00 local Auckland event inside the user's today", () => {
    // 2026-08-16T09:00Z = 2026-08-16 21:00 in Auckland (UTC+12, winter).
    const now = new Date("2026-08-16T09:00:00Z");
    const { start, end } = todayWindow("Pacific/Auckland", now);

    // Auckland's Aug 16 runs 2026-08-15T12:00Z → 2026-08-16T12:00Z.
    expect(start.toISOString()).toBe("2026-08-15T12:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-16T12:00:00.000Z");

    // An event at 22:00 local (10:00Z) is inside the window.
    const event = new Date("2026-08-16T10:00:00Z");
    expect(event >= start && event < end).toBe(true);
  });

  it("handles a zone behind UTC", () => {
    // 2026-08-16T02:00Z is still Aug 15 in Los Angeles (UTC-7, DST).
    const now = new Date("2026-08-16T02:00:00Z");
    const { start, end } = todayWindow("America/Los_Angeles", now);

    expect(start.toISOString()).toBe("2026-08-15T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-16T07:00:00.000Z");
  });

  it("falls back to server-local midnight without a timezone", () => {
    const now = new Date("2026-08-16T15:30:00Z");
    const { start, end } = todayWindow(null, now);

    const expectedStart = new Date(now);
    expectedStart.setHours(0, 0, 0, 0);
    expect(start.getTime()).toBe(expectedStart.getTime());
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
