import { describe, expect, it } from "vitest";

import { parseFirefliesSummary, toStringList } from "~/lib/fireflies-summary";

describe("parseFirefliesSummary list normalisation", () => {
  it("splits a newline-separated bullet_gist string into an array", () => {
    const parsed = parseFirefliesSummary(
      JSON.stringify({
        overview: "x",
        bullet_gist: "🚀 Launch moved\n- Budget approved\n\n• Hiring paused",
      }),
    );
    expect(parsed?.bullet_gist).toEqual([
      "🚀 Launch moved",
      "Budget approved",
      "Hiring paused",
    ]);
  });

  it("drops a list field that is an object", () => {
    const parsed = parseFirefliesSummary(
      JSON.stringify({ overview: "x", bullet_gist: { a: 1 }, keywords: {} }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("bullet_gist");
    expect(parsed).not.toHaveProperty("keywords");
  });

  it("filters non-strings out of a mixed array", () => {
    const parsed = parseFirefliesSummary(
      JSON.stringify({ gist: "g", topics_discussed: ["a", null, { b: 1 }, 2] }),
    );
    expect(parsed?.topics_discussed).toEqual(["a", "2"]);
  });

  it("drops non-array transcript_chapters", () => {
    const parsed = parseFirefliesSummary(
      JSON.stringify({ gist: "g", transcript_chapters: "nope" }),
    );
    expect(parsed).not.toHaveProperty("transcript_chapters");
  });

  it("leaves well-formed summaries unchanged", () => {
    const summary = {
      overview: "o",
      keywords: ["k"],
      bullet_gist: ["b"],
      action_items: "**Alice**\nDo it",
    };
    expect(parseFirefliesSummary(JSON.stringify(summary))).toEqual(summary);
  });
});

describe("toStringList", () => {
  it("returns undefined for null/undefined/objects", () => {
    expect(toStringList(null)).toBeUndefined();
    expect(toStringList(undefined)).toBeUndefined();
    expect(toStringList({})).toBeUndefined();
  });

  it("strips numbered list markers", () => {
    expect(toStringList("1. one\n2) two")).toEqual(["one", "two"]);
  });
});
