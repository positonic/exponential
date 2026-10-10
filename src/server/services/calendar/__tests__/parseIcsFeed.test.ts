/**
 * Unit tests for parseIcsFeed — the pure core of ICS feed sync. Fixture ICS
 * strings in, normalized events out; no network, no DB.
 */

import { describe, it, expect } from "vitest";

import { getSyncWindow, parseIcsFeed } from "../CalendarSyncService";

/** Wrap VEVENT bodies in a VCALENDAR envelope with CRLF line endings. */
function calendar(lines: string[], calendarProps: string[] = []): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//exponential-tests//EN",
    ...calendarProps,
    ...lines,
    "END:VCALENDAR",
  ].join("\r\n");
}

function vevent(props: string[]): string[] {
  return ["BEGIN:VEVENT", "DTSTAMP:20260801T000000Z", ...props, "END:VEVENT"];
}

// A window comfortably containing the August 2026 fixture dates.
const WINDOW = {
  from: new Date("2026-08-01T00:00:00Z"),
  to: new Date("2026-09-30T00:00:00Z"),
};

describe("parseIcsFeed", () => {
  it("parses a simple timed VEVENT", () => {
    const ics = calendar(
      vevent([
        "UID:evt-1",
        "DTSTART:20260818T090000Z",
        "DTEND:20260818T100000Z",
        "SUMMARY:Standup",
        "LOCATION:Room 1",
      ]),
    );

    const { events } = parseIcsFeed(ics, WINDOW);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      externalId: "evt-1",
      title: "Standup",
      location: "Room 1",
      isAllDay: false,
    });
    expect(events[0]!.startsAt.toISOString()).toBe("2026-08-18T09:00:00.000Z");
    expect(events[0]!.endsAt.toISOString()).toBe("2026-08-18T10:00:00.000Z");
  });

  it("reads X-WR-CALNAME and X-WR-TIMEZONE from the calendar envelope", () => {
    const ics = calendar(
      vevent(["UID:evt-1", "DTSTART:20260818T090000Z", "SUMMARY:A"]),
      ["X-WR-CALNAME:Team Cal", "X-WR-TIMEZONE:Europe/Berlin"],
    );

    const parsed = parseIcsFeed(ics, WINDOW);

    expect(parsed.calendarName).toBe("Team Cal");
    expect(parsed.calendarTimezone).toBe("Europe/Berlin");
  });

  it("marks DTSTART;VALUE=DATE events as all-day, defaulting a missing DTEND to one day", () => {
    const ics = calendar(
      vevent(["UID:evt-allday", "DTSTART;VALUE=DATE:20260820", "SUMMARY:Offsite"]),
    );

    const { events } = parseIcsFeed(ics, WINDOW);

    expect(events).toHaveLength(1);
    expect(events[0]!.isAllDay).toBe(true);
    expect(events[0]!.endsAt.getTime() - events[0]!.startsAt.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("drops events entirely outside the window, keeps ones straddling its edge", () => {
    const ics = calendar([
      ...vevent(["UID:before", "DTSTART:20260701T090000Z", "DTEND:20260701T100000Z", "SUMMARY:Old"]),
      ...vevent(["UID:straddle", "DTSTART:20260731T230000Z", "DTEND:20260801T010000Z", "SUMMARY:Overnight"]),
      ...vevent(["UID:after", "DTSTART:20261101T090000Z", "DTEND:20261101T100000Z", "SUMMARY:Far future"]),
    ]);

    const { events } = parseIcsFeed(ics, WINDOW);

    expect(events.map((e) => e.externalId)).toEqual(["straddle"]);
  });

  it("skips cancelled events", () => {
    const ics = calendar(
      vevent([
        "UID:evt-cancelled",
        "DTSTART:20260818T090000Z",
        "DTEND:20260818T100000Z",
        "SUMMARY:Cancelled thing",
        "STATUS:CANCELLED",
      ]),
    );

    expect(parseIcsFeed(ics, WINDOW).events).toHaveLength(0);
  });

  describe("recurrence expansion", () => {
    it("expands an RRULE into instances inside the window, honoring COUNT", () => {
      const ics = calendar(
        vevent([
          "UID:rec-count",
          "DTSTART:20260803T090000Z",
          "DTEND:20260803T100000Z",
          "RRULE:FREQ=WEEKLY;COUNT=4",
          "SUMMARY:Weekly",
        ]),
      );

      const { events } = parseIcsFeed(ics, WINDOW);

      expect(events.map((e) => e.startsAt.toISOString())).toEqual([
        "2026-08-03T09:00:00.000Z",
        "2026-08-10T09:00:00.000Z",
        "2026-08-17T09:00:00.000Z",
        "2026-08-24T09:00:00.000Z",
      ]);
      // Instances share the UID — disambiguation is by startsAt.
      expect(new Set(events.map((e) => e.externalId))).toEqual(new Set(["rec-count"]));
    });

    it("clips an unbounded RRULE to the window", () => {
      const ics = calendar(
        vevent([
          "UID:rec-unbounded",
          "DTSTART:20260803T090000Z",
          "DTEND:20260803T100000Z",
          "RRULE:FREQ=DAILY",
          "SUMMARY:Daily forever",
        ]),
      );

      const { events } = parseIcsFeed(ics, WINDOW);

      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.startsAt.getTime()).toBeGreaterThanOrEqual(WINDOW.from.getTime());
        expect(e.startsAt.getTime()).toBeLessThan(WINDOW.to.getTime());
      }
    });

    it("drops EXDATE-excluded instances", () => {
      const ics = calendar(
        vevent([
          "UID:rec-exdate",
          "DTSTART:20260803T090000Z",
          "DTEND:20260803T100000Z",
          "RRULE:FREQ=WEEKLY;COUNT=3",
          "EXDATE:20260810T090000Z",
          "SUMMARY:Weekly",
        ]),
      );

      const { events } = parseIcsFeed(ics, WINDOW);

      expect(events.map((e) => e.startsAt.toISOString())).toEqual([
        "2026-08-03T09:00:00.000Z",
        "2026-08-17T09:00:00.000Z",
      ]);
    });

    it("applies RECURRENCE-ID overrides — moved time and changed title stick", () => {
      const ics = calendar([
        ...vevent([
          "UID:rec-override",
          "DTSTART;TZID=Europe/Berlin:20260817T090000",
          "DTEND;TZID=Europe/Berlin:20260817T100000",
          "RRULE:FREQ=WEEKLY;COUNT=3",
          "SUMMARY:Standup",
          "LOCATION:Room 1",
        ]),
        ...vevent([
          "UID:rec-override",
          "RECURRENCE-ID;TZID=Europe/Berlin:20260824T090000",
          "DTSTART;TZID=Europe/Berlin:20260824T140000",
          "DTEND;TZID=Europe/Berlin:20260824T150000",
          "SUMMARY:Standup (moved)",
        ]),
      ]);

      const { events } = parseIcsFeed(ics, WINDOW);

      // Berlin in August is UTC+2, so 09:00 local = 07:00Z.
      expect(events.map((e) => [e.startsAt.toISOString(), e.title])).toEqual([
        ["2026-08-17T07:00:00.000Z", "Standup"],
        ["2026-08-24T12:00:00.000Z", "Standup (moved)"],
        ["2026-08-31T07:00:00.000Z", "Standup"],
      ]);
    });

    it("drops instances cancelled via a STATUS:CANCELLED override", () => {
      const ics = calendar([
        ...vevent([
          "UID:rec-cancelled-inst",
          "DTSTART:20260803T090000Z",
          "DTEND:20260803T100000Z",
          "RRULE:FREQ=WEEKLY;COUNT=3",
          "SUMMARY:Weekly",
        ]),
        ...vevent([
          "UID:rec-cancelled-inst",
          "RECURRENCE-ID:20260810T090000Z",
          "DTSTART:20260810T090000Z",
          "DTEND:20260810T100000Z",
          "STATUS:CANCELLED",
          "SUMMARY:Weekly",
        ]),
      ]);

      const { events } = parseIcsFeed(ics, WINDOW);

      expect(events.map((e) => e.startsAt.toISOString())).toEqual([
        "2026-08-03T09:00:00.000Z",
        "2026-08-17T09:00:00.000Z",
      ]);
    });

    it("keeps local wall-clock time across a DST boundary (TZID recurrence)", () => {
      // Berlin leaves CEST on 2026-10-25: 09:00 local is 07:00Z before,
      // 08:00Z after.
      const window = {
        from: new Date("2026-10-01T00:00:00Z"),
        to: new Date("2026-11-30T00:00:00Z"),
      };
      const ics = calendar(
        vevent([
          "UID:rec-dst",
          "DTSTART;TZID=Europe/Berlin:20261019T090000",
          "DTEND;TZID=Europe/Berlin:20261019T100000",
          "RRULE:FREQ=WEEKLY;COUNT=3",
          "SUMMARY:Across DST",
        ]),
      );

      const { events } = parseIcsFeed(ics, window);

      expect(events.map((e) => e.startsAt.toISOString())).toEqual([
        "2026-10-19T07:00:00.000Z",
        "2026-10-26T08:00:00.000Z",
        "2026-11-02T08:00:00.000Z",
      ]);
    });

    it("skips an event whose RRULE explodes without failing the rest of the feed", () => {
      const ics = calendar([
        ...vevent([
          "UID:rec-bad",
          "DTSTART:20260803T090000Z",
          "DTEND:20260803T091500Z",
          // Per-minute forever: blows the backend's per-rule iteration cap.
          "RRULE:FREQ=MINUTELY",
          "SUMMARY:Malformed cadence",
        ]),
        ...vevent([
          "UID:evt-good",
          "DTSTART:20260818T090000Z",
          "DTEND:20260818T100000Z",
          "SUMMARY:Still here",
        ]),
      ]);

      const { events } = parseIcsFeed(ics, WINDOW);

      expect(events.some((e) => e.externalId === "evt-good")).toBe(true);
      expect(events.some((e) => e.externalId === "rec-bad")).toBe(false);
    });

    it("fails the parse when the feed expands past the aggregate event cap", () => {
      // 8 hourly recurrences × ~1,400 instances each in the 2-month window
      // clears the 10k aggregate cap while staying under the per-rule cap.
      const blocks: string[] = [];
      for (let i = 0; i < 8; i++) {
        blocks.push(
          ...vevent([
            `UID:hourly-${i}`,
            "DTSTART:20260801T000000Z",
            "DTEND:20260801T003000Z",
            "RRULE:FREQ=HOURLY",
            `SUMMARY:Hourly ${i}`,
          ]),
        );
      }

      expect(() => parseIcsFeed(calendar(blocks), WINDOW)).toThrow(/too many|more than/i);
    });

    it("expands all-day recurrences anchored to UTC midnight of the calendar date", () => {
      const ics = calendar(
        vevent([
          "UID:rec-allday",
          "DTSTART;VALUE=DATE:20260817",
          "RRULE:FREQ=WEEKLY;COUNT=2",
          "SUMMARY:All-day weekly",
        ]),
      );

      const { events } = parseIcsFeed(ics, WINDOW);

      expect(events.map((e) => [e.startsAt.toISOString(), e.isAllDay])).toEqual([
        ["2026-08-17T00:00:00.000Z", true],
        ["2026-08-24T00:00:00.000Z", true],
      ]);
    });
  });

  it("returns no events for text that is not an ICS file", () => {
    const parsed = parseIcsFeed("<html>definitely not a calendar</html>", WINDOW);
    expect(parsed.events).toHaveLength(0);
  });

  it("defaults a missing DTEND on a timed event to zero duration and keeps it", () => {
    const ics = calendar(
      vevent(["UID:evt-instant", "DTSTART:20260818T090000Z", "SUMMARY:Ping"]),
    );

    const { events } = parseIcsFeed(ics, WINDOW);

    expect(events).toHaveLength(1);
    expect(events[0]!.endsAt.getTime()).toBe(events[0]!.startsAt.getTime());
  });
});

describe("getSyncWindow", () => {
  it("spans −1 week to +8 weeks around now", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    const { from, to } = getSyncWindow(now);
    expect(from.toISOString()).toBe("2026-08-09T12:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-11T12:00:00.000Z");
  });
});
