import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";

import { collectPageLinkIds, sanitizeDocForPublic } from "../public-doc";

function doc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function textWithMarks(marks: NonNullable<JSONContent["marks"]>): JSONContent {
  return { type: "text", text: "hi", marks };
}

describe("sanitizeDocForPublic", () => {
  it("keeps http(s) and mailto links", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          textWithMarks([
            { type: "link", attrs: { href: "https://example.com" } },
          ]),
          textWithMarks([{ type: "link", attrs: { href: "mailto:a@b.c" } }]),
        ],
      },
    ]);
    const out = sanitizeDocForPublic(input);
    const texts = out.content![0]!.content!;
    expect(texts[0]!.marks).toHaveLength(1);
    expect(texts[1]!.marks).toHaveLength(1);
  });

  it("drops javascript: and data: link marks but keeps the text", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          textWithMarks([
            { type: "bold" },
            { type: "link", attrs: { href: "javascript:alert(1)" } },
          ]),
        ],
      },
    ]);
    const out = sanitizeDocForPublic(input);
    const marks = out.content![0]!.content![0]!.marks!;
    expect(marks).toEqual([{ type: "bold" }]);
  });

  it("strips internal comment marks", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          textWithMarks([{ type: "comment", attrs: { commentId: "c1" } }]),
        ],
      },
    ]);
    const out = sanitizeDocForPublic(input);
    expect(out.content![0]!.content![0]!.marks).toEqual([]);
  });

  it("removes images with unsafe srcs, keeps https images", () => {
    const input = doc([
      { type: "image", attrs: { src: "https://blob.example/a.png" } },
      { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
      { type: "image", attrs: {} },
    ]);
    const out = sanitizeDocForPublic(input);
    expect(out.content).toHaveLength(1);
    expect(out.content![0]!.attrs!.src).toBe("https://blob.example/a.png");
  });

  it("sanitizes nested content recursively", () => {
    const input = doc([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "image", attrs: { src: "javascript:alert(1)" } },
              {
                type: "paragraph",
                content: [
                  textWithMarks([
                    { type: "link", attrs: { href: "vbscript:x" } },
                  ]),
                ],
              },
            ],
          },
        ],
      },
    ]);
    const out = sanitizeDocForPublic(input);
    const listItem = out.content![0]!.content![0]!;
    expect(listItem.content).toHaveLength(1);
    expect(listItem.content![0]!.content![0]!.marks).toEqual([]);
  });

  it("strips page ids and internal hrefs from page links, keeping the title", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: {
          pageId: "clx123",
          title: "Design notes",
          href: "/w/acme/pages/clx123",
        },
      },
      { type: "pageLink" },
    ]);
    const out = sanitizeDocForPublic(input);
    expect(out.content![0]).toEqual({
      type: "pageLink",
      attrs: { title: "Design notes" },
    });
    expect(out.content![1]).toEqual({
      type: "pageLink",
      attrs: { title: "Untitled" },
    });
  });

  it("links page links whose target is published, with the live title", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: { pageId: "clx1", title: "Old title", href: "/w/acme/pages/clx1" },
      },
      {
        type: "pageLink",
        attrs: { pageId: "clx2", title: "Private", href: "/w/acme/pages/clx2" },
      },
    ]);
    const out = sanitizeDocForPublic(
      input,
      new Map([["clx1", { title: "Live title", href: "/p/live-title-ab12cd34" }]]),
    );
    // Published target → paragraph linking to the public URL.
    expect(out.content![0]).toEqual({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Live title",
          marks: [{ type: "link", attrs: { href: "/p/live-title-ab12cd34" } }],
        },
      ],
    });
    // Unpublished target → title-only node, no id/href leak.
    expect(out.content![1]).toEqual({
      type: "pageLink",
      attrs: { title: "Private" },
    });
  });

  it("falls back to title-only when a resolved href is not app-relative", () => {
    const input = doc([
      {
        type: "pageLink",
        attrs: { pageId: "clx1", title: "Cached", href: "/w/acme/pages/clx1" },
      },
    ]);
    const out = sanitizeDocForPublic(
      input,
      // A target whose href is somehow unsafe must never reach the HTML.
      new Map([["clx1", { title: "Live", href: "javascript:alert(1)" }]]),
    );
    expect(out.content![0]).toEqual({
      type: "pageLink",
      attrs: { title: "Cached" },
    });
  });

  it("does not mutate the input document", () => {
    const input = doc([
      { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
    ]);
    const snapshot = JSON.parse(JSON.stringify(input)) as JSONContent;
    sanitizeDocForPublic(input);
    expect(input).toEqual(snapshot);
  });
});

describe("collectPageLinkIds", () => {
  it("collects distinct ids in document order, including nested nodes", () => {
    const input = doc([
      { type: "pageLink", attrs: { pageId: "b", title: "B" } },
      {
        type: "blockquote",
        content: [{ type: "pageLink", attrs: { pageId: "a", title: "A" } }],
      },
      { type: "pageLink", attrs: { pageId: "b", title: "B again" } },
      { type: "pageLink" },
      { type: "paragraph", content: [{ type: "text", text: "no links" }] },
    ]);
    expect(collectPageLinkIds(input)).toEqual(["b", "a"]);
  });

  it("returns empty for empty or missing docs", () => {
    expect(collectPageLinkIds(null)).toEqual([]);
    expect(collectPageLinkIds(doc([]))).toEqual([]);
  });
});
