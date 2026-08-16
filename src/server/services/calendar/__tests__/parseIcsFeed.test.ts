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

  it("skips recurring events for now (expansion is a separate slice)", () => {
    const ics = calendar(
      vevent([
        "UID:evt-recurring",
        "DTSTART:20260818T090000Z",
        "DTEND:20260818T100000Z",
        "RRULE:FREQ=WEEKLY",
        "SUMMARY:Weekly",
      ]),
    );

    expect(parseIcsFeed(ics, WINDOW).events).toHaveLength(0);
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
