import { describe, it, expect } from "vitest";
import { daysLeftLabel, daysUntil, resolveProjectTargetDate } from "../projectTargetDate";

const goal = (overrides: Partial<Parameters<typeof resolveProjectTargetDate>[1][number]> = {}) => ({
  title: "Win the grant",
  dueDate: null,
  period: null,
  status: "active",
  ...overrides,
});

describe("resolveProjectTargetDate", () => {
  it("prefers the project's own end date over any goal date", () => {
    const result = resolveProjectTargetDate(new Date(2026, 10, 1), [
      goal({ dueDate: new Date(2026, 9, 15) }),
    ]);
    expect(result).toEqual({ date: new Date(2026, 10, 1), source: "project" });
  });

  it("falls back to the goal's due date", () => {
    const result = resolveProjectTargetDate(null, [goal({ dueDate: "2026-10-20T00:00:00.000Z" })]);
    expect(result).toEqual({
      date: new Date("2026-10-20T00:00:00.000Z"),
      source: "goal",
      goalTitle: "Win the grant",
    });
  });

  it("uses the end of the goal's OKR period when it has no due date", () => {
    const result = resolveProjectTargetDate(null, [goal({ period: "Q4-2026" })]);
    expect(result?.date).toEqual(new Date(2026, 11, 31));
  });

  it("picks the earliest date across linked goals and skips archived ones", () => {
    const result = resolveProjectTargetDate(undefined, [
      goal({ title: "Later", dueDate: new Date(2026, 11, 1) }),
      goal({ title: "Archived", dueDate: new Date(2026, 9, 10), status: "archived" }),
      goal({ title: "Sooner", period: "Q4-2026", dueDate: new Date(2026, 10, 1) }),
    ]);
    expect(result).toMatchObject({ source: "goal", goalTitle: "Sooner" });
  });

  it("returns null when nothing carries a date", () => {
    expect(resolveProjectTargetDate(null, [goal({ period: "someday" })])).toBeNull();
    expect(resolveProjectTargetDate(null, [])).toBeNull();
  });
});

describe("daysUntil / daysLeftLabel", () => {
  const now = new Date(2026, 9, 7, 18, 30);

  it("counts calendar days, ignoring the time of day", () => {
    expect(daysUntil(new Date(2026, 9, 8, 0, 1), now)).toBe(1);
    expect(daysUntil(new Date(2026, 9, 7, 9, 0), now)).toBe(0);
    expect(daysUntil(new Date(2026, 9, 4), now)).toBe(-3);
  });

  it("labels future, today and past dates", () => {
    expect(daysLeftLabel(24)).toBe("24 days left");
    expect(daysLeftLabel(1)).toBe("1 day left");
    expect(daysLeftLabel(0)).toBe("Due today");
    expect(daysLeftLabel(-1)).toBe("1 day overdue");
    expect(daysLeftLabel(-5)).toBe("5 days overdue");
  });
});
