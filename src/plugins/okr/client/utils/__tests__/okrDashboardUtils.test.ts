import { describe, it, expect } from "vitest";
import {
  periodStatus,
  periodCountdownLabel,
  effectiveStatus,
  effectiveConfidence,
  objectiveEffectiveConfidence,
} from "../okrDashboardUtils";

describe("effectiveStatus (ADR-0004 override ?? auto)", () => {
  it("prefers the override when set", () => {
    expect(effectiveStatus("at-risk", "on-track")).toBe("at-risk");
  });

  it("falls back to auto when there is no override", () => {
    expect(effectiveStatus(null, "on-track")).toBe("on-track");
    expect(effectiveStatus(undefined, "off-track")).toBe("off-track");
  });

  it("returns null when neither is set", () => {
    expect(effectiveStatus(null, null)).toBeNull();
  });

  it("treats an explicit override as winning even over a different auto", () => {
    // The whole point: a human can mark at-risk even when the number looks fine.
    expect(effectiveConfidence("at-risk", "on-track")).toBe("warn");
  });
});

describe("objectiveEffectiveConfidence", () => {
  it("uses the manual override above everything", () => {
    expect(
      objectiveEffectiveConfidence("off-track", "on-track", ["on-track"]),
    ).toBe("bad");
  });

  it("uses the auto health cache when there is no override", () => {
    expect(objectiveEffectiveConfidence(null, "at-risk", ["on-track"])).toBe(
      "warn",
    );
  });

  it("falls back to a worst-KR roll-up when the cache is cold", () => {
    // health null / "no-update" → derive from effective KR statuses (worst wins)
    expect(
      objectiveEffectiveConfidence(null, null, ["on-track", "off-track"]),
    ).toBe("bad");
    expect(
      objectiveEffectiveConfidence(null, "no-update", ["on-track", "on-track"]),
    ).toBe("ok");
  });

  it("is idle when cold and there are no KRs", () => {
    expect(objectiveEffectiveConfidence(null, null, [])).toBe("idle");
  });
});

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
