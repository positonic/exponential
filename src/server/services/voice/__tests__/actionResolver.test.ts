import { describe, it, expect } from "vitest";

import {
  normalizeDescription,
  rankActionMatches,
  decideResolution,
} from "../actionMatch";

describe("normalizeDescription", () => {
  it("strips completion filler and articles", () => {
    expect(normalizeDescription("mark the JWT refactor as done")).toBe("jwt refactor");
    expect(normalizeDescription("complete my investor update task")).toBe("investor update");
    expect(normalizeDescription("finish the deploy please")).toBe("deploy");
  });

  it("drops punctuation and collapses whitespace", () => {
    expect(normalizeDescription("  Call   Sam!! ")).toBe("call sam");
  });
});

describe("rankActionMatches", () => {
  const actions = [
    { id: "1", name: "JWT refactor" },
    { id: "2", name: "Investor update draft" },
    { id: "3", name: "Buy milk" },
  ];

  it("finds an exact-ish single match", () => {
    const r = rankActionMatches("mark the JWT refactor as done", actions);
    expect(r.map((a) => a.id)).toEqual(["1"]);
  });

  it("matches by token subset", () => {
    const r = rankActionMatches("investor update", actions);
    expect(r[0]?.id).toBe("2");
  });

  it("returns empty when nothing matches", () => {
    expect(rankActionMatches("quarterly board deck", actions)).toEqual([]);
  });

  it("returns empty for an all-filler phrase", () => {
    expect(rankActionMatches("mark the task as done", actions)).toEqual([]);
  });
});

describe("decideResolution", () => {
  it("resolves to one when a single candidate clearly wins", () => {
    const d = decideResolution("JWT refactor", [
      { id: "1", name: "JWT refactor" },
      { id: "2", name: "Buy milk" },
    ]);
    expect(d.kind).toBe("one");
    if (d.kind === "one") expect(d.item.id).toBe("1");
  });

  it("returns ambiguous on a top-score tie (near-duplicates)", () => {
    const d = decideResolution("review", [
      { id: "1", name: "review" },
      { id: "2", name: "review" },
    ]);
    expect(d.kind).toBe("ambiguous");
    if (d.kind === "ambiguous") expect(d.items).toHaveLength(2);
  });

  it("never silently picks among equal substring matches", () => {
    const d = decideResolution("update", [
      { id: "1", name: "update the website" },
      { id: "2", name: "update the budget" },
    ]);
    // Both are equal "query is substring of name" (score 60) → ambiguous.
    expect(d.kind).toBe("ambiguous");
  });

  it("returns none when nothing matches", () => {
    expect(decideResolution("xyz", [{ id: "1", name: "JWT refactor" }]).kind).toBe(
      "none",
    );
  });

  it("prefers the strictly-better match over a weaker one", () => {
    const d = decideResolution("JWT refactor", [
      { id: "1", name: "JWT refactor" }, // exact-ish (80+)
      { id: "2", name: "refactor the JWT module and tests" }, // token subset (40)
    ]);
    expect(d.kind).toBe("one");
    if (d.kind === "one") expect(d.item.id).toBe("1");
  });
});
