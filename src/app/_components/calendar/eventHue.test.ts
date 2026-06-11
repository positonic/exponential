import { describe, it, expect } from "vitest";

import { getEventHue, isEventPast } from "./eventHue";

// ── getEventHue ──────────────────────────────────────────────────────

describe("getEventHue", () => {
  it("maps cancelled events to rose regardless of calendar", () => {
    expect(getEventHue({ id: "a", status: "cancelled", calendarId: "x" })).toBe(
      "rose",
    );
  });

  it("maps tentative events to amber", () => {
    expect(
      getEventHue({ id: "a", status: "tentative", calendarId: "x" }),
    ).toBe("amber");
  });

  it("maps low-signal calendars (holidays / birthdays) to slate", () => {
    expect(
      getEventHue({ id: "a", calendarName: "US Holidays", summary: "Labor Day" }),
    ).toBe("slate");
    expect(
      getEventHue({ id: "b", summary: "Jane's Birthday" }),
    ).toBe("slate");
  });

  it("is stable per source calendar (same calendarId → same hue)", () => {
    const hue1 = getEventHue({ id: "evt-1", calendarId: "team@group.calendar.google.com" });
    const hue2 = getEventHue({ id: "evt-2", calendarId: "team@group.calendar.google.com" });
    expect(hue1).toBe(hue2);
  });

  it("only ever picks a vivid hue (never slate) from the calendar hash", () => {
    const hue = getEventHue({ id: "x", calendarId: "personal@gmail.com" });
    expect(hue).not.toBe("slate");
  });

  it("falls back to the event id when there is no source calendar", () => {
    const hue = getEventHue({ id: "preview-1" });
    const same = getEventHue({ id: "preview-1" });
    expect(hue).toBe(same);
  });
});

// ── isEventPast ──────────────────────────────────────────────────────

describe("isEventPast", () => {
  const NOW = new Date("2026-06-11T17:00:00").getTime(); // local 5pm, June 11

  it("treats a finished timed event as past", () => {
    expect(isEventPast({ dateTime: "2026-06-11T16:00:00" }, NOW)).toBe(true);
  });

  it("treats an ongoing/future timed event as not past", () => {
    expect(isEventPast({ dateTime: "2026-06-11T18:00:00" }, NOW)).toBe(false);
  });

  it("does NOT dim today's all-day event in the afternoon (exclusive end.date)", () => {
    // All-day event on June 11 → exclusive end.date is June 12.
    // Must stay "not past" at 5pm local on June 11 (the timezone-bug regression).
    expect(isEventPast({ date: "2026-06-12" }, NOW)).toBe(false);
  });

  it("treats a finished all-day event as past", () => {
    // All-day event on June 10 → exclusive end.date is June 11 (local midnight),
    // which is before NOW (5pm June 11).
    expect(isEventPast({ date: "2026-06-11" }, NOW)).toBe(true);
  });

  it("returns false when no end information is present", () => {
    expect(isEventPast({}, NOW)).toBe(false);
  });
});
