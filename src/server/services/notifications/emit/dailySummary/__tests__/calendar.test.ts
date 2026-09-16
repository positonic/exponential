import { describe, expect, it } from "vitest";
import { eventsOnLocalDay, summaryWindow } from "../calendar";

const TZ = "Europe/Berlin";
// 09:05 in Berlin (CEST, UTC+2) on 2026-09-09.
const NOW = new Date("2026-09-09T07:05:00.000Z");

describe("summaryWindow", () => {
  it("spans [yesterday 00:00, tomorrow 00:00) in the user's timezone as UTC instants", () => {
    const w = summaryWindow(NOW, TZ);
    expect(w.yesterdayKey).toBe("2026-09-08");
    expect(w.todayKey).toBe("2026-09-09");
    expect(w.yesterdayStart.toISOString()).toBe("2026-09-07T22:00:00.000Z");
    expect(w.todayStart.toISOString()).toBe("2026-09-08T22:00:00.000Z");
    expect(w.tomorrowStart.toISOString()).toBe("2026-09-09T22:00:00.000Z");
  });

  it("uses the local day even when UTC has already rolled over", () => {
    // 23:30 in New York on the 8th is 03:30 UTC on the 9th.
    const w = summaryWindow(new Date("2026-09-09T03:30:00.000Z"), "America/New_York");
    expect(w.todayKey).toBe("2026-09-08");
    expect(w.yesterdayKey).toBe("2026-09-07");
  });
});

describe("eventsOnLocalDay", () => {
  const events = [
    { summary: "Late night", start: { dateTime: "2026-09-08T22:30:00.000Z" }, end: { dateTime: "2026-09-08T23:00:00.000Z" } },
    { summary: "Standup", start: { dateTime: "2026-09-09T07:00:00.000Z" }, end: { dateTime: "2026-09-09T07:15:00.000Z" } },
    { summary: "Yesterday coffee", start: { dateTime: "2026-09-08T12:00:00.000Z" }, end: { dateTime: "2026-09-08T12:30:00.000Z" } },
    { summary: "Offsite", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } },
    { summary: "Conference", start: { date: "2026-09-07" }, end: { date: "2026-09-09" } },
    { summary: "  ", start: { date: "2026-09-08" } },
    { summary: "No start" },
  ];

  it("keeps timed events by their local start day, all-day events first, with HH:mm in the user's zone", () => {
    const today = eventsOnLocalDay(events, "2026-09-09", TZ);
    expect(today.map((e) => [e.title, e.startLocal])).toEqual([
      ["Offsite", null],
      // 22:30 UTC on the 8th is 00:30 in Berlin on the 9th.
      ["Late night", "00:30"],
      ["Standup", "09:00"],
    ]);
  });

  it("treats end.date as exclusive and falls back to (untitled) for blank summaries", () => {
    const yesterday = eventsOnLocalDay(events, "2026-09-08", TZ);
    expect(yesterday.map((e) => [e.title, e.startLocal])).toEqual([
      ["Conference", null],
      ["(untitled)", null],
      ["Yesterday coffee", "14:00"],
    ]);
  });
});
