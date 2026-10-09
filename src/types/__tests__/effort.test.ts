import { describe, expect, it } from "vitest";
import { effortFieldLabel, effortOptions, effortPillLabel, effortToLabel } from "../effort";

describe("effort unit helpers", () => {
  it("offers the unit's own choices, each storing a number", () => {
    expect(effortOptions("T_SHIRT").map((o) => o.label)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(effortOptions("T_SHIRT").map((o) => o.value)).toEqual([1, 2, 3, 5, 8]);
    expect(effortOptions("STORY_POINTS").map((o) => o.value)).toEqual([1, 2, 3, 5, 8, 13, 21]);
    expect(effortOptions("HOURS").map((o) => o.label)).toContain("8h");
  });

  it("labels a stored value in the workspace's vocabulary", () => {
    expect(effortToLabel(3, "T_SHIRT")).toBe("M");
    expect(effortToLabel(3, "STORY_POINTS")).toBe("3");
    expect(effortToLabel(3, "HOURS")).toBe("3h");
    expect(effortToLabel(4, "T_SHIRT")).toBe("4"); // off-scale value still shown
  });

  it("builds pill text with the unit suffix only for story points", () => {
    expect(effortPillLabel(null, "T_SHIRT")).toBe("Effort");
    expect(effortPillLabel(3, "T_SHIRT")).toBe("M");
    expect(effortPillLabel(3, "STORY_POINTS")).toBe("3 pts");
    expect(effortPillLabel(8, "HOURS")).toBe("8h");
  });

  it("names the form field per unit", () => {
    expect(effortFieldLabel("STORY_POINTS")).toBe("Story points");
    expect(effortFieldLabel("T_SHIRT")).toBe("Size");
    expect(effortFieldLabel("HOURS")).toBe("Hours");
  });
});
