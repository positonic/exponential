import { describe, expect, it } from "vitest";

import { renderUpdateMarkdown, mdEscape, toChatMarkdown } from "../render";
import { MAX_ALSO, MAX_HIGHLIGHTS, isSelectionEmpty, selectItems } from "../select";
import type { ShippedItem, WrittenUpdate } from "../types";
import { constrainToSelection, templateWriter } from "../writer";

function item(id: string, weight: number, at = "2026-10-01T10:00:00.000Z", extra: Partial<ShippedItem> = {}): ShippedItem {
  return { id, source: "ticket", title: `Title ${id}`, weight, at, ...extra };
}

describe("selectItems", () => {
  it("ranks by weight, then most recent, and caps highlights and one-liners", () => {
    const items = [
      item("t:low", 20),
      item("scope:a", 80, "2026-10-01T09:00:00.000Z"),
      item("scope:b", 80, "2026-10-01T11:00:00.000Z"),
      ...Array.from({ length: 12 }, (_, i) => item(`t:${String(i).padStart(2, "0")}`, 40)),
    ];
    const selection = selectItems(items);

    expect(selection.highlights.map((i) => i.id)).toEqual(["scope:b", "scope:a", "t:00"]);
    expect(selection.highlights).toHaveLength(MAX_HIGHLIGHTS);
    expect(selection.also).toHaveLength(MAX_ALSO);
    // 15 selectable − 3 highlights − 8 one-liners
    expect(selection.moreCount).toBe(4);
  });

  it("never selects or counts weight-0 items (chores, spikes, research)", () => {
    const selection = selectItems([item("chore", 0), item("spike", 0)]);
    expect(isSelectionEmpty(selection)).toBe(true);
    expect(selection.moreCount).toBe(0);
  });
});

describe("constrainToSelection", () => {
  const selection = selectItems([item("a", 80), item("b", 40), item("c", 40), item("d", 20)]);

  it("drops anything citing an item outside the selection, and duplicates", () => {
    const written: WrittenUpdate = {
      headline: "H",
      intro: "T",
      highlights: [
        { itemId: "a", title: "A", body: "a" },
        { itemId: "invented", title: "Never shipped", body: "x" },
        { itemId: "a", title: "A again", body: "dup" },
      ],
      also: [
        { itemId: "d", line: "d line" },
        { itemId: "a", line: "a is a highlight, not a one-liner" },
      ],
      model: "m",
    };
    const out = constrainToSelection(written, selection);
    expect(out.highlights.map((h) => h.itemId)).toEqual(["a"]);
    expect(out.also.map((a) => a.itemId)).toEqual(["d"]);
  });
});

describe("renderUpdateMarkdown", () => {
  it("renders headline, intro, linked highlights, one-liners and +N more", async () => {
    const selection = {
      ...selectItems([
        item("a", 80, undefined, { url: "https://app/x", title: "Dark mode" }),
        item("b", 40, undefined, { title: "Faster search" }),
        item("c", 40),
        item("d", 20, undefined, { title: "Fix export" }),
      ]),
      moreCount: 2,
    };
    const written = await templateWriter.write(selection, { workspaceName: "Acme", windowLabel: "25 Sep – 1 Oct" });
    const md = renderUpdateMarkdown(
      { ...written, also: [{ itemId: "d", line: "Exports no longer time out" }] },
      selection,
      { moreUrl: "https://app/w/acme/activity" },
    );

    expect(md).toMatch(/^# Dark mode\n\nNew at Acme, 25 Sep – 1 Oct: Dark mode, Faster search and Title c, plus 3 smaller changes\./);
    expect(md).toContain("## Highlights");
    expect(md).toContain("### [Dark mode](https://app/x)");
    expect(md).toContain("## Also shipped\n\n- **Fix export**: Exports no longer time out");
    expect(md).toContain("[+2 more changes →](https://app/w/acme/activity)");
  });

  it("uses the writer's plain title for a one-liner when it gives one", () => {
    const selection = selectItems([
      item("a", 80),
      item("b", 40),
      item("c", 40),
      item("d", 20, undefined, { title: "Docs v3", url: "https://app/d" }),
    ]);
    const md = renderUpdateMarkdown(
      {
        headline: "H",
        intro: "I",
        highlights: [],
        also: [{ itemId: "d", title: "Every docs page asks if it helped", line: "Tell us what's missing." }],
        model: "m",
      },
      selection,
      { moreUrl: "https://app/more" },
    );
    expect(md).toContain("- **[Every docs page asks if it helped](https://app/d)**: Tell us what's missing.");
  });

  it("escapes record text so titles cannot inject links or formatting", () => {
    expect(mdEscape("[click](https://evil) **now**")).toBe("\\[click\\](https://evil) \\*\\*now\\*\\*");
  });
});

describe("toChatMarkdown", () => {
  it("turns headings into bold lines and leaves the rest alone", () => {
    const md = "# Headline\n\nIntro.\n\n## Highlights\n\n### [Bulk edit](https://app/x)\n\nBody.\n\n- **A**: a\n- **B**: b";
    expect(toChatMarkdown(md)).toBe(
      "**Headline**\n\nIntro.\n\n**Highlights**\n\n**[Bulk edit](https://app/x)**\n\nBody.\n\n- **A**: a\n- **B**: b",
    );
  });

  it("doesn't double-bold a heading that is already bold", () => {
    expect(toChatMarkdown("## **Done**")).toBe("**Done**");
  });
});

