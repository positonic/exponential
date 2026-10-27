import { describe, it, expect } from "vitest";
import {
  applyGoalsViewParams,
  effectivePeriodOf,
  parseDrawerParam,
  parseGoalsViewParams,
} from "../useGoalsViewParams";

// A fixed "now" so the defaults (current quarter, current year) are stable.
const NOW = new Date(2026, 9, 27); // 27 Oct 2026 → Q4-2026
const parse = (qs: string) => parseGoalsViewParams(new URLSearchParams(qs), NOW);

/** The one-shot rewrite the page performs for a retired URL. */
const rewrite = (qs: string) => {
  const params = new URLSearchParams(qs);
  return applyGoalsViewParams(params, parse(qs), NOW).toString();
};

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
    expect(parse("view=timeline")).toMatchObject({ view: "timeline", isLegacy: false });
    expect(parse("view=key-results")).toMatchObject({ view: "key-results" });
  });

  it("falls back to the defaults for unknown values", () => {
    expect(parse("view=bogus&period=H1&year=20x6")).toMatchObject({
      view: "table",
      period: "Q4",
      year: "2026",
      isLegacy: false,
    });
  });

  it("parses the drawer param", () => {
    expect(parse("drawer=objective:42").drawer).toEqual({ type: "objective", id: "42" });
    expect(parse("drawer=keyResult:cml123").drawer).toEqual({ type: "keyResult", id: "cml123" });
    expect(parse("drawer=project:1").drawer).toBeNull();
  });
});

describe("legacy URLs — every retired encoding rewrites to the current grammar", () => {
  it("tab=goals → the Table view (default, so omitted)", () => {
    expect(parse("tab=goals")).toMatchObject({ view: "table", isLegacy: true });
    expect(rewrite("tab=goals")).toBe("");
  });

  it("tab=okrs → view=okrs", () => {
    expect(parse("tab=okrs")).toMatchObject({ view: "okrs", onlyMine: false, isLegacy: true });
    expect(rewrite("tab=okrs")).toBe("view=okrs");
  });

  it("tab=my-goals → view=okrs&mine=1", () => {
    expect(parse("tab=my-goals")).toMatchObject({ view: "okrs", onlyMine: true, isLegacy: true });
    expect(rewrite("tab=my-goals")).toBe("view=okrs&mine=1");
  });

  it("period=Timeline → view=timeline, with the pseudo-period dropped", () => {
    expect(parse("tab=okrs&year=2026&period=Timeline")).toMatchObject({
      view: "timeline",
      period: "Q4",
      isLegacy: true,
    });
    const out = new URLSearchParams(rewrite("tab=okrs&year=2026&period=Timeline"));
    expect(out.get("view")).toBe("timeline");
    expect(out.get("period")).toBeNull();
    expect(out.get("tab")).toBeNull();
  });

  it("the old per-tab timeline toggle (tab=…&view=timeline) is the Timeline view", () => {
    expect(parse("tab=goals&view=timeline&mine=1")).toMatchObject({
      view: "timeline",
      onlyMine: true,
      isLegacy: true,
    });
    expect(rewrite("tab=goals&view=timeline&mine=1")).toBe("view=timeline&mine=1");
  });

  it("an unknown tab still counts as retired and lands on the Table view", () => {
    expect(parse("tab=bogus")).toMatchObject({ view: "table", isLegacy: true });
    expect(rewrite("tab=bogus")).toBe("");
  });

  it("keeps the period, year, drawer and filter params through the rewrite", () => {
    const out = new URLSearchParams(
      rewrite("tab=okrs&year=2027&period=Q1&drawer=objective:4&health=at-risk&q=rev"),
    );
    expect(out.get("view")).toBe("okrs");
    expect(out.get("period")).toBe("Q1");
    expect(out.get("year")).toBe("2027");
    expect(out.get("drawer")).toBe("objective:4");
    expect(out.get("health")).toBe("at-risk");
    expect(out.get("q")).toBe("rev");
  });

  it("a current URL is never flagged for rewriting", () => {
    expect(parse("view=okrs&period=Q1&year=2027&mine=1&drawer=keyResult:x").isLegacy).toBe(false);
  });
});

describe("applyGoalsViewParams — default omission", () => {
  const apply = (qs: string, next: Parameters<typeof applyGoalsViewParams>[1]) =>
    applyGoalsViewParams(new URLSearchParams(qs), next, NOW).toString();

  it("omits view, period and year at their defaults and mine when off", () => {
    expect(apply("", { view: "table", period: "Q4", year: "2026", onlyMine: false })).toBe("");
  });

  it("clears a previously written value that returns to its default", () => {
    expect(
      apply("view=okrs&period=all&year=2027&mine=1", {
        view: "table",
        period: "Q4",
        year: "2026",
        onlyMine: false,
      }),
    ).toBe("");
  });

  it("writes every non-default value", () => {
    expect(
      apply("", { view: "okrs", period: "all", year: "2027", onlyMine: true }),
    ).toBe("view=okrs&period=all&year=2027&mine=1");
  });

  it("round-trips: parsing what it wrote gives the same state", () => {
    const state = { view: "timeline" as const, period: "Annual" as const, year: "2025", onlyMine: true };
    expect(parse(apply("", state))).toMatchObject(state);
  });

  it("leaves params it does not own alone", () => {
    const out = new URLSearchParams(
      apply("q=rev&health=at-risk&drawer=objective:4", {
        view: "okrs",
        period: "Q4",
        year: "2026",
        onlyMine: false,
      }),
    );
    expect(out.get("q")).toBe("rev");
    expect(out.get("health")).toBe("at-risk");
    expect(out.get("drawer")).toBe("objective:4");
    expect(out.get("view")).toBe("okrs");
  });
});

describe("parseDrawerParam", () => {
  it("returns null for missing param", () => {
    expect(parseDrawerParam(null)).toBeNull();
    expect(parseDrawerParam("")).toBeNull();
  });

  it("parses an objective deep-link", () => {
    expect(parseDrawerParam("objective:42")).toEqual({ type: "objective", id: "42" });
  });

  it("parses a key result deep-link with a cuid id", () => {
    expect(parseDrawerParam("keyResult:cml123abc")).toEqual({
      type: "keyResult",
      id: "cml123abc",
    });
  });

  it("preserves colons inside the id", () => {
    expect(parseDrawerParam("keyResult:a:b")).toEqual({ type: "keyResult", id: "a:b" });
  });

  it("returns null for an unknown entity type", () => {
    expect(parseDrawerParam("project:1")).toBeNull();
    expect(parseDrawerParam("objective")).toBeNull();
  });

  it("returns null when the id is empty", () => {
    expect(parseDrawerParam("objective:")).toBeNull();
  });

  it("returns null when there is no separator", () => {
    expect(parseDrawerParam("objective42")).toBeNull();
  });
});

describe("effectivePeriodOf", () => {
  it("is null on All and the period string otherwise", () => {
    expect(effectivePeriodOf("all", "2026")).toBeNull();
    expect(effectivePeriodOf("Q4", "2026")).toBe("Q4-2026");
    expect(effectivePeriodOf("Annual", "2027")).toBe("Annual-2027");
  });
});
