import { describe, it, expect } from "vitest";
import {
  PRIORITY_NONE,
  priorityFromPillValue,
  priorityPillColor,
  priorityPillValue,
} from "../priorityPill";

describe("priorityPill", () => {
  it("reads null and 4 (No priority) as the one None choice", () => {
    expect(priorityPillValue(null)).toBe(PRIORITY_NONE);
    expect(priorityPillValue(undefined)).toBe(PRIORITY_NONE);
    expect(priorityPillValue(4)).toBe(PRIORITY_NONE);
  });

  it("keeps real priorities, including Urgent (0)", () => {
    expect(priorityPillValue(0)).toBe("0");
    expect(priorityPillValue(3)).toBe("3");
  });

  it("clears the field when None is picked, and round-trips the rest", () => {
    expect(priorityFromPillValue(PRIORITY_NONE)).toBeNull();
    expect(priorityFromPillValue("0")).toBe(0);
    expect(priorityFromPillValue(priorityPillValue(2))).toBe(2);
  });

  it("tints None gray and Urgent red", () => {
    expect(priorityPillColor(null)).toBe("gray");
    expect(priorityPillColor(0)).toBe("red");
  });
});
