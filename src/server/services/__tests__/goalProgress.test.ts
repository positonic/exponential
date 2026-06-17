import { describe, it, expect } from "vitest";
import {
  keyResultProgress,
  resolveGoalProgress,
  isManualProgress,
} from "../goalProgress";

const kr = (start: number, current: number, target: number) => ({
  startValue: start,
  currentValue: current,
  targetValue: target,
});

describe("keyResultProgress", () => {
  it("returns null when there are no key results", () => {
    expect(keyResultProgress([])).toBeNull();
  });

  it("returns null when every KR has a zero range", () => {
    expect(keyResultProgress([kr(10, 10, 10), kr(5, 8, 5)])).toBeNull();
  });

  it("computes (current - start) / (target - start) as a percentage", () => {
    expect(keyResultProgress([kr(0, 30, 50)])).toBe(60);
  });

  it("averages across measurable KRs and skips zero-range ones", () => {
    // 60% and 20% -> mean 40%; the zero-range KR is ignored
    expect(keyResultProgress([kr(0, 30, 50), kr(0, 20, 100), kr(5, 5, 5)])).toBe(
      40,
    );
  });

  it("clamps each KR to [0, 100] before averaging", () => {
    // overshoot clamps to 100, regression clamps to 0 -> mean 50
    expect(keyResultProgress([kr(0, 200, 100), kr(0, -50, 100)])).toBe(50);
  });
});

describe("resolveGoalProgress", () => {
  it("uses the KR mean when there is no override", () => {
    expect(
      resolveGoalProgress({ progressOverride: null, keyResults: [kr(0, 30, 50)] }),
    ).toBe(60);
  });

  it("returns null when no override and no measurable KRs", () => {
    expect(
      resolveGoalProgress({ progressOverride: null, keyResults: [] }),
    ).toBeNull();
  });

  it("lets a manual override win over the KR mean", () => {
    expect(
      resolveGoalProgress({ progressOverride: 90, keyResults: [kr(0, 30, 50)] }),
    ).toBe(90);
  });

  it("honours an override of 0 (not treated as unset)", () => {
    expect(
      resolveGoalProgress({ progressOverride: 0, keyResults: [kr(0, 30, 50)] }),
    ).toBe(0);
  });

  it("clamps and rounds the override to [0, 100]", () => {
    expect(
      resolveGoalProgress({ progressOverride: 142.6, keyResults: [] }),
    ).toBe(100);
    expect(resolveGoalProgress({ progressOverride: -5, keyResults: [] })).toBe(0);
  });
});

describe("isManualProgress", () => {
  it("is true only when an override is set (including 0)", () => {
    expect(isManualProgress({ progressOverride: 0, keyResults: [] })).toBe(true);
    expect(isManualProgress({ progressOverride: 50, keyResults: [] })).toBe(true);
    expect(isManualProgress({ progressOverride: null, keyResults: [] })).toBe(
      false,
    );
    expect(isManualProgress({ keyResults: [] })).toBe(false);
  });
});
