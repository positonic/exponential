import { describe, expect, it } from "vitest";
import { formatDecisionLabel, parseDecisionLabel } from "../decision-label";

describe("parseDecisionLabel", () => {
  it("reads a D-number in any case and any padding", () => {
    expect(parseDecisionLabel("D-0006")).toBe(6);
    expect(parseDecisionLabel("d-0006")).toBe(6);
    expect(parseDecisionLabel("D-6")).toBe(6);
    expect(parseDecisionLabel(" D-0042 ")).toBe(42);
    expect(parseDecisionLabel(formatDecisionLabel(1234))).toBe(1234);
  });

  it("is null for anything that is not a label, so callers treat it as an id", () => {
    expect(parseDecisionLabel("cmk01wbrb000arzxzj8zy4czg")).toBeNull();
    expect(parseDecisionLabel("D-")).toBeNull();
    expect(parseDecisionLabel("D-0")).toBeNull();
    expect(parseDecisionLabel("D-12a")).toBeNull();
    expect(parseDecisionLabel("API-0003")).toBeNull();
    expect(parseDecisionLabel("D-99999999999")).toBeNull();
  });
});
