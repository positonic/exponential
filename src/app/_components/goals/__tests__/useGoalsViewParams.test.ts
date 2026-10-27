import { describe, it, expect } from "vitest";
import {
  applyGoalsViewParams,
  effectivePeriodOf,
  parseGoalsViewParams,
} from "../useGoalsViewParams";

// A fixed "now" so the defaults (current quarter, current year) are stable.
const NOW = new Date(2026, 9, 27); // 27 Oct 2026 → Q4-2026
const parse = (qs: string) => parseGoalsViewParams(new URLSearchParams(qs), NOW);

describe("parseGoalsViewParams", () => {
  it("defaults to the Table view, the current quarter and year, everyone's goals", () => {
    expect(parse("")).toEqual({
      view: "table",
      period: "Q4",
      year: "2026",
      onlyMine: false,
      drawer: null,
      isLegacy: false,
    });
  });

  it("reads view, period, year and mine independently", () => {
    expect(parse("view=okrs&period=Q2&year=2027&mine=1")).toMatchObject({
      view: "okrs",
      period: "Q2",
      year: "2027",
      onlyMine: true,
    });
    expect(parse("period=all")).toMatchObject({ period: "all", view: "table" });
  });

  it("falls back to the defaults for unknown values", () => {
    expect(parse("view=bogus&period=H1&year=20x6")).toMatchObject({
      view: "table",
      period: "Q4",
      year: "2026",
    });
  });

  it("parses the drawer param", () => {
    expect(parse("drawer=objective:42").drawer).toEqual({ type: "objective", id: "42" });
    expect(parse("drawer=keyResult:cml123").drawer).toEqual({ type: "keyResult", id: "cml123" });
  });
});

describe("applyGoalsViewParams", () => {
  const apply = (qs: string, next: Parameters<typeof applyGoalsViewParams>[1]) =>
    applyGoalsViewParams(new URLSearchParams(qs), next, NOW).toString();

  it("omits view, period and year at their defaults and mine when off", () => {
    expect(apply("", { view: "table", period: "Q4", year: "2026", onlyMine: false })).toBe("");
  });

  it("writes every non-default value", () => {
    expect(
      apply("", { view: "okrs", period: "all", year: "2027", onlyMine: true }),
    ).toBe("view=okrs&period=all&year=2027&mine=1");
  });

  it("leaves params it does not own alone", () => {
    const out = apply("q=rev&health=at-risk&drawer=objective:4", {
      view: "okrs",
      period: "Q4",
      year: "2026",
      onlyMine: false,
    });
    expect(new URLSearchParams(out).get("q")).toBe("rev");
    expect(new URLSearchParams(out).get("health")).toBe("at-risk");
    expect(new URLSearchParams(out).get("drawer")).toBe("objective:4");
    expect(new URLSearchParams(out).get("view")).toBe("okrs");
  });
});

describe("effectivePeriodOf", () => {
  it("is null on All and the period string otherwise", () => {
    expect(effectivePeriodOf("all", "2026")).toBeNull();
    expect(effectivePeriodOf("Q4", "2026")).toBe("Q4-2026");
    expect(effectivePeriodOf("Annual", "2027")).toBe("Annual-2027");
  });
});
