/**
 * The `database` node (ADR-0078 §2, §7): serialises to a marker line only,
 * and parses the marker back — swallowing the projected table under it — so
 * a body read expanded and written back keeps the block and no table.
 */
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";

import { docToMarkdown, markdownToDoc } from "../codec";
import { databaseMarker } from "~/lib/databases/marker";
import { collectDatabaseNodeIds } from "~/lib/databases/doc";

const DB = "clx1234567890db";
const TABLE = [
  "| Name | Status |",
  "| --- | --- |",
  "| [Alert latency](/w/acme/pages/r1) | Tracked |",
  "| Coverage |  |",
].join("\n");

const nodesOf = (doc: JSONContent) => (doc.content ?? []).map((n) => n.type);

describe("database node", () => {
  it("serialises to the marker on its own line, never the rows", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Data strategy" }] },
        { type: "database", attrs: { databaseId: DB, name: "Metrics" } },
        { type: "paragraph", content: [{ type: "text", text: "Closing." }] },
      ],
    };
    expect(docToMarkdown(doc)).toBe(`# Data strategy\n\n${databaseMarker(DB)}\n\nClosing.`);
  });

  it("parses a bare marker into the node", () => {
    const doc = markdownToDoc(`Intro.\n\n${databaseMarker(DB)}\n\nAfter.`);
    expect(nodesOf(doc)).toEqual(["paragraph", "database", "paragraph"]);
    expect(collectDatabaseNodeIds(doc)).toEqual([DB]);
  });

  it("parses an expanded body back to the node and drops the table under the marker", () => {
    const expanded = `# Data strategy\n\n${databaseMarker(DB)}\n\n${TABLE}\n\nClosing.`;
    const doc = markdownToDoc(expanded);
    expect(nodesOf(doc)).toEqual(["heading", "database", "paragraph"]);
    expect(doc.content?.[1]?.attrs?.databaseId).toBe(DB);
    // Round trip: the stored body is the marker again, rows never written.
    expect(docToMarkdown(doc)).toBe(`# Data strategy\n\n${databaseMarker(DB)}\n\nClosing.`);
  });

  it("drops the 'more rows' trailer with the table", () => {
    const expanded = `${databaseMarker(DB)}\n\n${TABLE}\n\n_60 more rows not shown._\n\nClosing.`;
    const doc = markdownToDoc(expanded);
    expect(nodesOf(doc)).toEqual(["database", "paragraph"]);
    expect(docToMarkdown(doc)).toBe(`${databaseMarker(DB)}\n\nClosing.`);
  });

  it("leaves a table that has no marker above it alone", () => {
    const doc = markdownToDoc(`Plain table:\n\n${TABLE}`);
    expect(nodesOf(doc)).toEqual(["paragraph", "table"]);
  });

  it("keeps a table that is not directly under the marker", () => {
    const doc = markdownToDoc(`${databaseMarker(DB)}\n\nA paragraph between.\n\n${TABLE}`);
    expect(nodesOf(doc)).toEqual(["database", "paragraph", "table"]);
  });

  it("ignores an unrelated HTML comment and an inline mention of the marker", () => {
    const doc = markdownToDoc(`<!-- note to self -->\n\nSee <!-- database:${DB} --> inline.`);
    expect(collectDatabaseNodeIds(doc)).toEqual([]);
  });

  it("two blocks keep their order and ids", () => {
    const doc = markdownToDoc(`${databaseMarker("a1")}\n\n${TABLE}\n\n${databaseMarker("b2")}`);
    expect(collectDatabaseNodeIds(doc)).toEqual(["a1", "b2"]);
    expect(nodesOf(doc)).toEqual(["database", "database"]);
  });
});
