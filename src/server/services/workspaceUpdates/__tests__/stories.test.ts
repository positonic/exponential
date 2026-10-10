import { describe, expect, it } from "vitest";

import { selectItems } from "../select";
import { cleanWorkTitle, groupIntoStories, summarizeBody } from "../stories";
import type { ShippedItem } from "../types";

const docs = { id: "f-docs", name: "Docs", description: "Help pages for every part of the app.", url: "https://app/docs" };
const updates = { id: "f-upd", name: "Workspace updates", description: "A weekly update, written for you.", url: "https://app/upd" };

function ticket(id: string, title: string, extra: Partial<ShippedItem> = {}): ShippedItem {
  return { id: `ticket:${id}`, source: "ticket", title, weight: 40, at: "2026-10-01T10:00:00.000Z", ...extra };
}

describe("cleanWorkTitle", () => {
  it.each([
    ["V2: Publish & distribute on approval", "Publish & distribute on approval"],
    ["Docs v3: per-page Open Graph images", "per-page Open Graph images"],
    ["Docs v3 – llms.txt and llms-full.txt", "llms.txt and llms-full.txt"],
    ["v1.2 - faster search", "faster search"],
    ["Bulk edit for tickets", "Bulk edit for tickets"],
    ["V2:", "V2:"],
  ])("%s → %s", (input, expected) => {
    expect(cleanWorkTitle(input)).toBe(expected);
  });
});

describe("summarizeBody", () => {
  it("prefers the 'What to build' section of a ticket", () => {
    const body = "## Parent\n\nFeature `x`.\n\n## What to build\n\nVisitors **subscribe** from the [updates page](https://x).\n\n## Actions\n\n1. Tracer";
    expect(summarizeBody(body)).toBe("Visitors subscribe from the updates page.");
  });

  it("falls back to the first paragraph that isn't a heading, and truncates on a word", () => {
    expect(summarizeBody("# Title\n\nFirst paragraph here.\n\nSecond.")).toBe("First paragraph here.");
    expect(summarizeBody("word ".repeat(100), 20)).toMatch(/^(word ){3}word…$/);
    expect(summarizeBody("   ")).toBeUndefined();
  });
});

describe("groupIntoStories", () => {
  it("tells a feature's tickets as one story under the feature's name", () => {
    const stories = groupIntoStories([
      ticket("a", "Docs v3: per-page feedback", { feature: docs, detail: "Ask if a page helped." }),
      ticket("b", "Docs v3: Open Graph images", { feature: docs, at: "2026-10-02T10:00:00.000Z" }),
      ticket("c", "Fix CSV export", { weight: 20 }),
    ]);

    const story = stories.find((s) => s.id === "story:f-docs")!;
    expect(story).toMatchObject({
      title: "Docs",
      detail: "Help pages for every part of the app.",
      url: "https://app/docs",
      // Its best piece's weight; breadth is recorded separately.
      weight: 40,
      size: 2,
      at: "2026-10-02T10:00:00.000Z",
    });
    expect(story.parts).toEqual([
      { title: "Open Graph images" },
      { title: "per-page feedback", detail: "Ask if a page helped." },
    ]);
    // No feature: stays its own story, title untouched.
    expect(stories.find((s) => s.id === "ticket:c")?.title).toBe("Fix CSV export");
  });

  it("makes a feature going Live the story, with its milestones and tickets as parts", () => {
    const [story] = groupIntoStories([
      { id: "feature:f-upd", source: "feature", title: "Workspace updates", weight: 100, at: "2026-10-02T09:00:00.000Z", feature: updates },
      { id: "feature_scope:s2", source: "feature_scope", title: "Publish on approval", weight: 80, at: "2026-10-02T08:00:00.000Z", feature: updates },
      ticket("t", "V1: Weekly draft & owner approval", { feature: updates }),
    ]);

    expect(story).toMatchObject({ id: "story:f-upd", source: "feature", title: "Workspace updates", weight: 100, size: 3 });
    expect(story!.parts!.map((p) => p.title)).toEqual(["Publish on approval", "Weekly draft & owner approval"]);
  });

  it("counts the pieces beyond the cap instead of silently dropping them", () => {
    const [story] = groupIntoStories(Array.from({ length: 11 }, (_, i) => ticket(`p${i}`, `Piece ${i}`, { feature: docs })));
    expect(story!.parts).toHaveLength(8);
    expect(story!.parts![7]).toEqual({ title: "4 more smaller changes" });
    expect(story!.size).toBe(11);
  });

  it("drops chores, spikes and research before grouping", () => {
    expect(groupIntoStories([ticket("x", "Bump deps", { weight: 0, feature: docs })])).toEqual([]);
  });
});

describe("selectItems with stories", () => {
  it("ranks a feature that moved a lot above a lone change of the same kind", () => {
    const selection = selectItems([
      ticket("lone", "Faster search", { at: "2026-10-02T12:00:00.000Z" }),
      ticket("d1", "Docs v3: feedback", { feature: docs }),
      ticket("d2", "Docs v3: images", { feature: docs }),
      ticket("d3", "Docs v3: llms.txt", { feature: docs }),
    ]);

    expect(selection.highlights.map((s) => s.title)).toEqual(["Docs", "Faster search"]);
    expect(selection.highlights[0]!.parts).toHaveLength(3);
  });

  it("never lets breadth lift a story above a more newsworthy kind of change", () => {
    const selection = selectItems([
      ...Array.from({ length: 6 }, (_, i) => ticket(`d${i}`, `Docs piece ${i}`, { feature: docs, at: "2026-10-02T12:00:00.000Z" })),
      {
        id: "feature_scope:s1",
        source: "feature_scope",
        title: "Publish on approval",
        weight: 80,
        at: "2026-09-26T10:00:00.000Z",
        feature: updates,
      },
    ]);

    // A milestone outranks six finished tickets, however recent.
    expect(selection.highlights.map((s) => s.title)).toEqual(["Workspace updates", "Docs"]);
  });
});
