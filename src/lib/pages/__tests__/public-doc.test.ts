import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";

import { sanitizeDocForPublic } from "../public-doc";

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

  it("does not mutate the input document", () => {
    const input = doc([
      { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
    ]);
    const snapshot = JSON.parse(JSON.stringify(input)) as JSONContent;
    sanitizeDocForPublic(input);
    expect(input).toEqual(snapshot);
  });
});
