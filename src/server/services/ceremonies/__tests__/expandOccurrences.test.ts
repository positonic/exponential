import { describe, expect, it } from "vitest";
import {
  expandOccurrences,
  nextOccurrence,
  type CadenceDefinition,
} from "../expandOccurrences";

const weekdays9amBerlin: CadenceDefinition = {
  cadenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
  timezone: "Europe/Berlin",
  startsOn: new Date("2026-09-01T00:00:00.000Z"),
  durationMinutes: 15,
};

describe("expandOccurrences", () => {
  it("evaluates the rule in the ceremony's time zone", () => {
    // Mon 7 Sep 2026 09:00 CEST = 07:00 UTC.
    const slots = expandOccurrences(
      weekdays9amBerlin,
      new Date("2026-09-07T00:00:00.000Z"),
      new Date("2026-09-07T23:59:59.000Z"),
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]!.scheduledStart.toISOString()).toBe("2026-09-07T07:00:00.000Z");
    expect(slots[0]!.scheduledEnd.toISOString()).toBe("2026-09-07T07:15:00.000Z");
  });

  it("skips weekends and honours window bounds inclusively", () => {
    const slots = expandOccurrences(
      weekdays9amBerlin,
      new Date("2026-09-04T07:00:00.000Z"), // Fri 09:00 CEST, inclusive
      new Date("2026-09-08T07:00:00.000Z"), // Tue 09:00 CEST, inclusive
    );
    expect(slots.map((s) => s.scheduledStart.toISOString())).toEqual([
      "2026-09-04T07:00:00.000Z",
      "2026-09-07T07:00:00.000Z",
      "2026-09-08T07:00:00.000Z",
    ]);
  });

  it("never produces ticks before the anchor date", () => {
    const slots = expandOccurrences(
      weekdays9amBerlin,
      new Date("2026-08-24T00:00:00.000Z"),
      new Date("2026-09-02T00:00:00.000Z"),
    );
    expect(slots.map((s) => s.scheduledStart.toISOString())).toEqual([
      "2026-09-01T07:00:00.000Z",
    ]);
  });

  it("follows a DST change: the wall-clock time stays fixed", () => {
    // CEST → CET on 25 Oct 2026; 09:00 Berlin becomes 08:00 UTC afterwards.
    const slots = expandOccurrences(
      weekdays9amBerlin,
      new Date("2026-10-23T00:00:00.000Z"),
      new Date("2026-10-27T00:00:00.000Z"),
    );
    expect(slots.map((s) => s.scheduledStart.toISOString())).toEqual([
      "2026-10-23T07:00:00.000Z",
      "2026-10-26T08:00:00.000Z",
    ]);
  });

  it("returns nothing for an inverted window and no duplicates across overlapping windows", () => {
    expect(
      expandOccurrences(weekdays9amBerlin, new Date("2026-09-10"), new Date("2026-09-01")),
    ).toEqual([]);
    const a = expandOccurrences(weekdays9amBerlin, new Date("2026-09-01"), new Date("2026-09-08"));
    const b = expandOccurrences(weekdays9amBerlin, new Date("2026-09-05"), new Date("2026-09-12"));
    const merged = new Set([...a, ...b].map((s) => s.scheduledStart.getTime()));
    expect(merged.size).toBe(
      expandOccurrences(weekdays9amBerlin, new Date("2026-09-01"), new Date("2026-09-12")).length,
    );
  });

  it("accepts a rule with the RRULE: prefix and defaults to midnight without BYHOUR", () => {
    const slots = expandOccurrences(
      { ...weekdays9amBerlin, cadenceRule: "RRULE:FREQ=WEEKLY;BYDAY=MO" },
      new Date("2026-09-06T00:00:00.000Z"),
      new Date("2026-09-08T00:00:00.000Z"),
    );
    // Midnight Berlin = 22:00 UTC the previous day.
    expect(slots.map((s) => s.scheduledStart.toISOString())).toEqual(["2026-09-06T22:00:00.000Z"]);
  });

  it("handles a fortnightly rule and a monthly rule", () => {
    const fortnightly = expandOccurrences(
      { ...weekdays9amBerlin, cadenceRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;BYHOUR=14;BYMINUTE=30" },
      new Date("2026-09-01"),
      new Date("2026-10-01"),
    );
    expect(fortnightly.map((s) => s.scheduledStart.toISOString())).toEqual([
      "2026-09-02T12:30:00.000Z",
      "2026-09-16T12:30:00.000Z",
      "2026-09-30T12:30:00.000Z",
    ]);
    const monthly = expandOccurrences(
      { ...weekdays9amBerlin, cadenceRule: "FREQ=MONTHLY;BYDAY=1FR;BYHOUR=10;BYMINUTE=0" },
      new Date("2026-09-01"),
      new Date("2026-11-30"),
    );
    expect(monthly.map((s) => s.scheduledStart.toISOString())).toEqual([
      "2026-09-04T08:00:00.000Z",
      "2026-10-02T08:00:00.000Z",
      "2026-11-06T09:00:00.000Z",
    ]);
  });
});

describe("nextOccurrence", () => {
  it("returns the first tick strictly after the given instant", () => {
    const next = nextOccurrence(weekdays9amBerlin, new Date("2026-09-04T07:00:00.000Z"));
    expect(next?.scheduledStart.toISOString()).toBe("2026-09-07T07:00:00.000Z");
  });

  it("returns null once a COUNT-limited rule is exhausted", () => {
    const next = nextOccurrence(
      { ...weekdays9amBerlin, cadenceRule: "FREQ=DAILY;COUNT=1;BYHOUR=9;BYMINUTE=0" },
      new Date("2026-09-02T00:00:00.000Z"),
    );
    expect(next).toBeNull();
  });
});
