import { describe, it, expect } from "vitest";

import {
  DAILY_CONTEXT_MAX_SPEAKABLE_LENGTH,
  parseDailyContextFocus,
  parseTimezone,
  renderDailyContextSpeakable,
} from "../dailyContextSpeakable";
import type {
  DailySummaryCycle,
  DailySummaryDigest,
} from "~/server/services/notifications/emit/dailySummary";

const BASE = "https://app.test";

function digest(
  overrides: Partial<DailySummaryDigest> = {},
): DailySummaryDigest {
  return {
    firstName: "James",
    yesterday: [],
    todayMeetings: [],
    todaysActions: [],
    overdueActions: [],
    overdueCount: 0,
    todayUrl: `${BASE}/today`,
    cycles: [],
    ...overrides,
  };
}

function cycle(overrides: Partial<DailySummaryCycle> = {}): DailySummaryCycle {
  return {
    productName: "CLEAR",
    name: "Cycle 15",
    range: "3 Sep – 16 Sep",
    daysLeft: 7,
    completed: 1,
    committed: 4,
    unit: "pts",
    elapsedPct: 51,
    pace: "behind",
    cycleUrl: `${BASE}/w/acme/products/clear/cycles/cy1`,
    inFlight: [
      {
        label: "C-532 x.com signals - poc",
        title: "x.com signals - poc",
        status: "IN_PROGRESS",
        url: `${BASE}/t/532`,
      },
      {
        label: "C-600 Fix auth",
        title: "Fix auth",
        status: "BLOCKED",
        url: `${BASE}/t/600`,
      },
    ],
    upNext: [
      {
        label: "C-154 Pipeline thunderdome",
        title: "Pipeline thunderdome",
        url: `${BASE}/t/154`,
      },
      {
        label: "C-470 Delivery playbook",
        title: "Delivery playbook",
        url: `${BASE}/t/470`,
      },
    ],
    unrefinedCount: 2,
    ...overrides,
  };
}

const overdue = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Overdue ${i + 1}` }));

describe("renderDailyContextSpeakable — overview", () => {
  it("covers meetings, actions, overdue and the cycle in one short pass", () => {
    const out = renderDailyContextSpeakable(
      digest({
        todayMeetings: [
          { startLocal: "09:00", title: "CLEAR daily standup" },
          { startLocal: null, title: "Offsite" },
        ],
        todaysActions: [
          { name: "Gather medical bills" },
          { name: "Pay Malte" },
        ],
        overdueActions: overdue(21),
        overdueCount: 21,
        cycles: [cycle()],
      }),
    );
    expect(out).toBe(
      "2 meetings today: 9:00 CLEAR daily standup and Offsite all day. " +
        "2 actions for today: Gather medical bills and Pay Malte. " +
        "21 actions overdue. " +
        "Cycle 15: 1 of 4 points done, 7 days left, behind pace. " +
        "In flight: x.com signals - poc and Fix auth. " +
        "Up next: 2 tickets.",
    );
  });

  it("names a few items per section and counts the rest", () => {
    const out = renderDailyContextSpeakable(
      digest({
        todaysActions: [
          { name: "a" },
          { name: "b" },
          { name: "c" },
          { name: "d" },
          { name: "e" },
        ],
      }),
    );
    expect(out).toContain("5 actions for today: a, b, c and 2 more.");
  });

  it("says so plainly when the day is clear, and omits the cycle when there is none", () => {
    expect(renderDailyContextSpeakable(digest())).toBe(
      "No meetings today. Nothing scheduled or due today. Nothing overdue.",
    );
  });

  it("prefixes the product name only when more than one cycle is in play", () => {
    const two = digest({
      cycles: [
        cycle(),
        cycle({ productName: "Exponential iOS", name: "Sprint 3" }),
      ],
    });
    const out = renderDailyContextSpeakable(two);
    expect(out).toContain("Cycle 15 in CLEAR:");
    expect(out).toContain("Sprint 3 in Exponential iOS:");
  });

  it("speaks a cycle with nothing committed without a pace", () => {
    const out = renderDailyContextSpeakable(
      digest({
        cycles: [
          cycle({
            completed: 0,
            committed: 0,
            pace: null,
            inFlight: [],
            upNext: [],
          }),
        ],
      }),
    );
    expect(out).toContain("Cycle 15: no tickets committed yet, 7 days left.");
    expect(out).not.toContain("In flight");
    expect(out).not.toContain("Up next");
  });
});

describe("renderDailyContextSpeakable — focused sections", () => {
  it("overdue: enumerates the overdue actions by name", () => {
    const out = renderDailyContextSpeakable(
      digest({ overdueActions: overdue(3), overdueCount: 3 }),
      "overdue",
    );
    expect(out).toBe("3 actions overdue: Overdue 1, Overdue 2 and Overdue 3.");
  });

  it("overdue: names up to eight, then counts", () => {
    const out = renderDailyContextSpeakable(
      digest({ overdueActions: overdue(21), overdueCount: 21 }),
      "overdue",
    );
    expect(out).toContain("21 actions overdue: Overdue 1, ");
    expect(out).toContain("Overdue 8 and 13 more.");
  });

  it("meetings: lists every meeting with its local start time", () => {
    const out = renderDailyContextSpeakable(
      digest({
        todayMeetings: [
          { startLocal: "09:00", title: "Standup" },
          { startLocal: "14:30", title: "Coffee with Ira" },
        ],
      }),
      "meetings",
    );
    expect(out).toBe(
      "2 meetings today: 9:00 Standup and 14:30 Coffee with Ira.",
    );
  });

  it("actions: enumerates today's actions and keeps the overdue count", () => {
    const out = renderDailyContextSpeakable(
      digest({
        todaysActions: [{ name: "Pay Malte" }],
        overdueActions: overdue(2),
        overdueCount: 2,
      }),
      "actions",
    );
    expect(out).toBe("1 action for today: Pay Malte. 2 actions overdue.");
  });

  it("cycle: reads progress, in-flight tickets with status, up next, and refinement debt", () => {
    const out = renderDailyContextSpeakable(
      digest({ cycles: [cycle()] }),
      "cycle",
    );
    expect(out).toBe(
      "Cycle 15: 1 of 4 points done, 7 days left, behind pace. " +
        "In flight: x.com signals - poc (in progress) and Fix auth (blocked). " +
        "Up next: Pipeline thunderdome and Delivery playbook. " +
        "2 tickets of yours still need refinement.",
    );
  });

  it("cycle: states the empty states when there is no cycle or nothing assigned", () => {
    expect(renderDailyContextSpeakable(digest(), "cycle")).toBe(
      "No active cycle.",
    );
    const out = renderDailyContextSpeakable(
      digest({
        cycles: [
          cycle({ inFlight: [], upNext: [], unrefinedCount: 0, daysLeft: -2 }),
        ],
      }),
      "cycle",
    );
    expect(out).toContain("2 days over");
    expect(out).toContain("Nothing in flight for you.");
    expect(out).toContain("Nothing else committed to you.");
  });

  it("stays within the daily-context speakable ceiling", () => {
    const out = renderDailyContextSpeakable(
      digest({
        overdueActions: Array.from({ length: 8 }, (_, i) => ({
          name: `a very long overdue action name number ${i} that rambles on and on`,
        })),
        overdueCount: 8,
      }),
      "overdue",
    );
    expect(out.length).toBeLessThanOrEqual(DAILY_CONTEXT_MAX_SPEAKABLE_LENGTH);
  });
});

describe("argument parsing", () => {
  it("accepts each known focus and falls back to overview", () => {
    expect(parseDailyContextFocus("overdue")).toBe("overdue");
    expect(parseDailyContextFocus("cycle")).toBe("cycle");
    expect(parseDailyContextFocus("everything")).toBe("overview");
    expect(parseDailyContextFocus(undefined)).toBe("overview");
  });

  it("accepts an IANA timezone and rejects garbage", () => {
    expect(parseTimezone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(parseTimezone(" UTC ")).toBe("UTC");
    expect(parseTimezone("Mars/Olympus")).toBeNull();
    expect(parseTimezone("")).toBeNull();
    expect(parseTimezone(42)).toBeNull();
  });
});
