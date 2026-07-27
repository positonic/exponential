import { describe, it, expect } from "vitest";

import {
  currentTriggerInstant,
  periodKey,
  isDue,
  resolveDueDefinitions,
  parseCadence,
  type Cadence,
  type ScheduledDefinition,
} from "../scheduleResolver";

const daily: Cadence = { kind: "daily", hour: 8 };
const weeklyMon: Cadence = { kind: "weekly", hour: 9, weekday: 1 }; // Monday 09:00

function def(
  over: Partial<ScheduledDefinition> = {},
): ScheduledDefinition {
  return { id: "d1", isActive: true, cadence: daily, lastRunAt: null, ...over };
}

describe("currentTriggerInstant", () => {
  it("daily → today at the configured hour (UTC)", () => {
    const now = new Date("2026-06-20T10:30:00Z");
    expect(currentTriggerInstant(daily, now).toISOString()).toBe(
      "2026-06-20T08:00:00.000Z",
    );
  });

  it("weekly → most recent configured weekday at hour", () => {
    // 2026-06-20 is a Saturday; previous Monday is 2026-06-15.
    const now = new Date("2026-06-20T10:30:00Z");
    expect(currentTriggerInstant(weeklyMon, now).toISOString()).toBe(
      "2026-06-15T09:00:00.000Z",
    );
  });
});

describe("isDue (daily)", () => {
  it("is due after the hour when never run", () => {
    expect(isDue(def(), new Date("2026-06-20T08:00:00Z"))).toBe(true);
    expect(isDue(def(), new Date("2026-06-20T23:59:00Z"))).toBe(true);
  });

  it("is NOT due before the configured hour", () => {
    expect(isDue(def(), new Date("2026-06-20T07:59:00Z"))).toBe(false);
  });

  it("is NOT due when already run this period (idempotency)", () => {
    const ranToday = def({ lastRunAt: new Date("2026-06-20T08:00:05Z") });
    expect(isDue(ranToday, new Date("2026-06-20T12:00:00Z"))).toBe(false);
  });

  it("is due again the next period after a prior run", () => {
    const ranYesterday = def({ lastRunAt: new Date("2026-06-19T08:00:05Z") });
    expect(isDue(ranYesterday, new Date("2026-06-20T08:01:00Z"))).toBe(true);
  });

  it("is never due when inactive", () => {
    expect(isDue(def({ isActive: false }), new Date("2026-06-20T12:00:00Z"))).toBe(
      false,
    );
  });
});

describe("isDue (weekly)", () => {
  it("is due on/after the weekday@hour when not yet run this week", () => {
    // Monday 2026-06-15 09:30 — past the 09:00 instant.
    expect(
      isDue(def({ cadence: weeklyMon }), new Date("2026-06-15T09:30:00Z")),
    ).toBe(true);
  });

  it("is NOT due if it already ran this week", () => {
    const ran = def({
      cadence: weeklyMon,
      lastRunAt: new Date("2026-06-15T09:00:10Z"),
    });
    expect(ran && isDue(ran, new Date("2026-06-17T12:00:00Z"))).toBe(false);
  });
});

describe("periodKey", () => {
  it("is stable within a period and changes across periods", () => {
    const a = periodKey(daily, new Date("2026-06-20T08:30:00Z"));
    const b = periodKey(daily, new Date("2026-06-20T20:00:00Z"));
    const c = periodKey(daily, new Date("2026-06-21T08:30:00Z"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("parseCadence", () => {
  it("parses a valid daily cadence", () => {
    expect(parseCadence({ schedule: { kind: "daily", hour: 8 } })).toEqual({
      kind: "daily",
      hour: 8,
    });
  });

  it("parses a valid weekly cadence", () => {
    expect(
      parseCadence({ schedule: { kind: "weekly", hour: 9, weekday: 1 } }),
    ).toEqual({ kind: "weekly", hour: 9, weekday: 1 });
  });

  it("returns null for malformed / missing / out-of-range config", () => {
    expect(parseCadence(null)).toBeNull();
    expect(parseCadence({})).toBeNull();
    expect(parseCadence({ schedule: { kind: "daily" } })).toBeNull();
    expect(parseCadence({ schedule: { kind: "daily", hour: 24 } })).toBeNull();
    expect(parseCadence({ schedule: { kind: "weekly", hour: 9 } })).toBeNull();
    expect(
      parseCadence({ schedule: { kind: "weekly", hour: 9, weekday: 7 } }),
    ).toBeNull();
    expect(parseCadence({ schedule: { kind: "monthly", hour: 9 } })).toBeNull();
  });
});

describe("resolveDueDefinitions", () => {
  it("returns only the due definitions", () => {
    const now = new Date("2026-06-20T08:05:00Z");
    const defs: ScheduledDefinition[] = [
      def({ id: "due-never-run" }),
      def({ id: "ran-this-period", lastRunAt: new Date("2026-06-20T08:00:01Z") }),
      def({ id: "inactive", isActive: false }),
      def({ id: "before-hour", cadence: { kind: "daily", hour: 23 } }),
    ];
    expect(resolveDueDefinitions(defs, now).map((d) => d.id)).toEqual([
      "due-never-run",
    ]);
  });
});
