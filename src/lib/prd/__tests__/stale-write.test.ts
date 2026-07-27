import { describe, it, expect } from "vitest";

import { checkStaleWrite } from "../stale-write";

describe("checkStaleWrite", () => {
  it("accepts a matching version and reports the next version", () => {
    expect(checkStaleWrite({ storedVersion: 0, baseVersion: 0 })).toEqual({
      accept: true,
      nextVersion: 1,
    });
    expect(checkStaleWrite({ storedVersion: 7, baseVersion: 7 })).toEqual({
      accept: true,
      nextVersion: 8,
    });
  });

  it("rejects a stale write when the stored version is newer", () => {
    expect(checkStaleWrite({ storedVersion: 3, baseVersion: 2 })).toEqual({
      accept: false,
      reason: "stale",
    });
    expect(checkStaleWrite({ storedVersion: 100, baseVersion: 1 })).toEqual({
      accept: false,
      reason: "stale",
    });
  });

  it("rejects as invalid when the claimed base was never persisted", () => {
    expect(checkStaleWrite({ storedVersion: 2, baseVersion: 5 })).toEqual({
      accept: false,
      reason: "invalid",
    });
  });

  it("rejects non-integer or negative versions as invalid", () => {
    expect(checkStaleWrite({ storedVersion: 1.5, baseVersion: 1 }).accept).toBe(false);
    expect(checkStaleWrite({ storedVersion: 1, baseVersion: -1 }).accept).toBe(false);
    expect(checkStaleWrite({ storedVersion: NaN, baseVersion: 0 })).toEqual({
      accept: false,
      reason: "invalid",
    });
  });
});
