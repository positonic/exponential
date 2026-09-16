import { describe, it, expect } from "vitest";
import {
  applyGoalsViewParams,
  parseGoalsViewParams,
} from "../useGoalsViewParams";

const parse = (qs: string) => parseGoalsViewParams(new URLSearchParams(qs));

describe("parseGoalsViewParams", () => {
  it("defaults to the Goals tab, everyone's goals, list view", () => {
    expect(parse("")).toEqual({
      tab: "goals",
      onlyMine: false,
      view: "list",
      isLegacy: false,
    });
  });

  it("reads the mine and view toggles independently of the tab", () => {
    expect(parse("tab=goals&mine=1&view=timeline")).toMatchObject({
      tab: "goals",
      onlyMine: true,
      view: "timeline",
    });
    expect(parse("tab=okrs&view=timeline")).toMatchObject({
      tab: "okrs",
      onlyMine: false,
      view: "timeline",
    });
  });

  it("treats an unknown tab as the Goals tab", () => {
    expect(parse("tab=bogus").tab).toBe("goals");
  });

  it("maps the retired My Goals tab onto OKRs + mine", () => {
    expect(parse("tab=my-goals")).toEqual({
      tab: "okrs",
      onlyMine: true,
      view: "list",
      isLegacy: true,
    });
  });

  it("maps the retired Timeline pseudo-period onto the timeline view", () => {
    expect(parse("tab=okrs&year=2026&period=Timeline")).toEqual({
      tab: "okrs",
      onlyMine: false,
      view: "timeline",
      isLegacy: true,
    });
  });
});

describe("applyGoalsViewParams", () => {
  it("writes the canonical form and drops the retired encodings", () => {
    const legacy = new URLSearchParams(
      "tab=my-goals&year=2026&period=Timeline&drawer=objective:4",
    );
    const next = applyGoalsViewParams(legacy, parse(legacy.toString()));
    expect(next.get("tab")).toBe("okrs");
    expect(next.get("mine")).toBe("1");
    expect(next.get("view")).toBe("timeline");
    expect(next.get("period")).toBeNull();
    // Unrelated params survive the rewrite.
    expect(next.get("year")).toBe("2026");
    expect(next.get("drawer")).toBe("objective:4");
  });

  it("removes the toggle params when they are switched off", () => {
    const on = new URLSearchParams("tab=goals&mine=1&view=timeline");
    const next = applyGoalsViewParams(on, {
      tab: "goals",
      onlyMine: false,
      view: "list",
    });
    expect(next.toString()).toBe("tab=goals");
  });
});
