import { describe, expect, it } from "vitest";

import { DUE_GRACE_MS, dueWeeklyInstant, latestWeeklyInstant, weeklyPeriodKey } from "../schedule";

const fridayNine = (timezone: string) => ({ weekday: 5, hour: 9, timezone });
const longAgo = new Date("2026-01-01T00:00:00.000Z");

describe("latestWeeklyInstant", () => {
  it("finds Friday 09:00 in the workspace's timezone", () => {
    // 09:30 EDT on Friday 2 Oct
    expect(latestWeeklyInstant(fridayNine("America/New_York"), new Date("2026-10-02T13:30:00.000Z")).toISOString()).toBe(
      "2026-10-02T13:00:00.000Z",
    );
  });

  it("before the hour on the day, returns the previous week's instant", () => {
    // 08:30 EDT on Friday 2 Oct
    expect(latestWeeklyInstant(fridayNine("America/New_York"), new Date("2026-10-02T12:30:00.000Z")).toISOString()).toBe(
      "2026-09-25T13:00:00.000Z",
    );
  });

  it("follows the wall clock across a DST change", () => {
    const berlin = fridayNine("Europe/Berlin");
    // Before Berlin leaves summer time (25 Oct): 09:00 CEST = 07:00Z.
    expect(latestWeeklyInstant(berlin, new Date("2026-10-23T07:10:00.000Z")).toISOString()).toBe("2026-10-23T07:00:00.000Z");
    // After: 09:00 CET = 08:00Z.
    expect(latestWeeklyInstant(berlin, new Date("2026-10-30T08:10:00.000Z")).toISOString()).toBe("2026-10-30T08:00:00.000Z");
  });

  it("keys the period by the trigger's local date", () => {
    // Friday 00:30 in Auckland is still Thursday in UTC.
    const instant = latestWeeklyInstant({ weekday: 5, hour: 0, timezone: "Pacific/Auckland" }, new Date("2026-10-01T12:00:00.000Z"));
    expect(weeklyPeriodKey(instant, "Pacific/Auckland")).toBe("2026-10-02");
  });
});

describe("dueWeeklyInstant", () => {
  const schedule = { ...fridayNine("UTC"), enabledAt: longAgo };

  it("is due within the grace window after the trigger", () => {
    expect(dueWeeklyInstant(schedule, new Date("2026-10-02T09:00:00.000Z"))?.toISOString()).toBe("2026-10-02T09:00:00.000Z");
    expect(dueWeeklyInstant(schedule, new Date(Date.parse("2026-10-02T09:00:00.000Z") + DUE_GRACE_MS - 1))).not.toBeNull();
  });

  it("is not due once the grace window has passed (no late backfill)", () => {
    expect(dueWeeklyInstant(schedule, new Date(Date.parse("2026-10-02T09:00:00.000Z") + DUE_GRACE_MS))).toBeNull();
    expect(dueWeeklyInstant(schedule, new Date("2026-10-05T09:00:00.000Z"))).toBeNull();
  });

  it("never drafts a period from before the copywriter was switched on", () => {
    expect(
      dueWeeklyInstant({ ...schedule, enabledAt: new Date("2026-10-02T09:20:00.000Z") }, new Date("2026-10-02T09:30:00.000Z")),
    ).toBeNull();
    expect(dueWeeklyInstant({ ...schedule, enabledAt: null }, new Date("2026-10-02T09:30:00.000Z"))).toBeNull();
  });
});
