import { describe, it, expect } from "vitest";
import { periodStatus, periodCountdownLabel } from "../okrDashboardUtils";

describe("periodStatus", () => {
  it("is active inside the period", () => {
    expect(periodStatus("Q1-2026", new Date(2026, 1, 15))).toBe("active");
  });

  it("is active on the last day (matches 'ends today')", () => {
    // Q1 ends Mar 31; on Mar 31 the countdown rounds to 0 days.
    expect(periodStatus("Q1-2026", new Date(2026, 2, 31))).toBe("active");
  });

  it("is ended after the period closes", () => {
    expect(periodStatus("Q1-2026", new Date(2026, 4, 29))).toBe("ended");
  });

  it("is upcoming before the period starts", () => {
    expect(periodStatus("Q3-2026", new Date(2026, 5, 1))).toBe("upcoming");
  });

  it("returns null for an unparseable period", () => {
    expect(periodStatus("nope", new Date(2026, 1, 15))).toBeNull();
  });
});

describe("periodCountdownLabel", () => {
  it("counts down while active", () => {
    expect(periodCountdownLabel("Q1-2026", new Date(2026, 1, 15))).toMatch(
      /^\d+d left$/,
    );
  });

  it("says 'ends today' on the last day", () => {
    expect(periodCountdownLabel("Q1-2026", new Date(2026, 2, 31))).toBe(
      "ends today",
    );
  });

  it("reports days since the period ended", () => {
    expect(periodCountdownLabel("Q1-2026", new Date(2026, 4, 29))).toBe(
      "ended 59d ago",
    );
  });

  it("reports days until an upcoming period starts", () => {
    expect(periodCountdownLabel("Q3-2026", new Date(2026, 5, 1))).toBe(
      "starts in 30d",
    );
  });

  it("returns null for an unparseable period", () => {
    expect(periodCountdownLabel("nope", new Date(2026, 1, 15))).toBeNull();
  });
});
