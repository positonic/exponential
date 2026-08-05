import { describe, expect, it } from "vitest";
import {
  buildBacklinkProperty,
  buildBodyBlocks,
  buildSourceProperty,
  SOURCE_MARKER_VALUE,
} from "../outboundCreate";
import type { NotionDbSchema } from "../outboundMapping";

const SCHEMA: NotionDbSchema = {
  Source: { type: "select", options: [] },
  Tags: { type: "multi_select", options: [] },
  Stage: { type: "status", options: [] },
  Notes: { type: "rich_text", options: [] },
  Priority: { type: "number", options: [] },
  Link: { type: "url", options: [] },
};

describe("buildSourceProperty", () => {
  it("uses a select payload", () => {
    expect(buildSourceProperty(SCHEMA, "Source").property).toEqual({
      Source: { select: { name: SOURCE_MARKER_VALUE } },
    });
  });
  it("uses a multi_select payload", () => {
    expect(buildSourceProperty(SCHEMA, "Tags").property).toEqual({
      Tags: { multi_select: [{ name: SOURCE_MARKER_VALUE }] },
    });
  });
  it("uses a status payload", () => {
    expect(buildSourceProperty(SCHEMA, "Stage").property).toEqual({
      Stage: { status: { name: SOURCE_MARKER_VALUE } },
    });
  });
  it("uses a rich_text payload", () => {
    expect(buildSourceProperty(SCHEMA, "Notes").property).toEqual({
      Notes: { rich_text: [{ text: { content: SOURCE_MARKER_VALUE } }] },
    });
  });
  it("warns (no property) when the property is missing", () => {
    const r = buildSourceProperty(SCHEMA, "Source-x");
    expect(r.property).toBeUndefined();
    expect(r.warning).toContain('no "Source-x" property');
  });
  it("warns when the property is an incompatible type", () => {
    const r = buildSourceProperty(SCHEMA, "Priority");
    expect(r.property).toBeUndefined();
    expect(r.warning).toContain("cannot set a source marker");
  });
});

describe("buildBacklinkProperty", () => {
  it("writes a url property when one exists", () => {
    expect(buildBacklinkProperty(SCHEMA, "Link", "https://x.dev/t/1")).toEqual({
      Link: { url: "https://x.dev/t/1" },
    });
  });
  it("returns null when there is no url property", () => {
    expect(buildBacklinkProperty(SCHEMA, "Missing", "https://x")).toBeNull();
    expect(buildBacklinkProperty(SCHEMA, "Source", "https://x")).toBeNull();
  });
});

describe("buildBodyBlocks", () => {
  it("leads with a back-link callout then a paragraph per body block", () => {
    const blocks = buildBodyBlocks(
      "First para.\n\nSecond para.",
      "https://x/t/1",
    ) as Array<{ type: string }>;
    expect(blocks[0]!.type).toBe("callout");
    expect(blocks.filter((b) => b.type === "paragraph")).toHaveLength(2);
  });

  it("emits just the callout when the body is empty", () => {
    const blocks = buildBodyBlocks(null, "https://x/t/1") as unknown[];
    expect(blocks).toHaveLength(1);
  });

  it("chunks a very long paragraph under Notion's rich-text limit", () => {
    // Post-ivory.pike: one paragraph BLOCK whose rich_text is chunked into
    // multiple spans (the renderer keeps semantic blocks intact).
    const long = "a".repeat(5000);
    const blocks = buildBodyBlocks(long, "https://x/t/1") as Array<{
      type: string;
      paragraph?: { rich_text: { text: { content: string } }[] };
    }>;
    const paras = blocks.filter((b) => b.type === "paragraph");
    expect(paras.length).toBe(1);
    const spans = paras[0]!.paragraph!.rich_text;
    expect(spans.length).toBeGreaterThan(1);
    for (const span of spans) {
      expect(span.text.content.length).toBeLessThanOrEqual(1900);
    }
  });

  it("renders Markdown bodies as real blocks (heading + code), not literal text", () => {
    const blocks = buildBodyBlocks(
      "## Problem\n\nThe `token` expires.\n\n```python\nraise X\n```",
      "https://x/t/1",
    ) as Array<{ type: string }>;
    expect(blocks[0]!.type).toBe("callout");
    expect(blocks.map((b) => b.type)).toEqual([
      "callout",
      "heading_2",
      "paragraph",
      "code",
    ]);
  });
});
