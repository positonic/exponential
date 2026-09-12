import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";

import { markdownToDoc, docToMarkdown, isDocEmpty, EMPTY_DOC } from "../codec";

const roundTrip = (md: string) => docToMarkdown(markdownToDoc(md));

describe("PRD document codec", () => {
  describe("markdownToDoc", () => {
    it("produces a ProseMirror doc node", () => {
      const doc = markdownToDoc("Hello world");
      expect(doc.type).toBe("doc");
      expect(Array.isArray(doc.content)).toBe(true);
    });

    it("maps blank/empty input to the canonical empty doc", () => {
      expect(markdownToDoc("")).toEqual(EMPTY_DOC);
      expect(markdownToDoc("   ")).toEqual(EMPTY_DOC);
      expect(markdownToDoc(null)).toEqual(EMPTY_DOC);
    });
  });

  describe("round-trips representative content", () => {
    it("paragraphs and inline marks", () => {
      const md = "A **bold**, *italic*, `code` paragraph.";
      expect(roundTrip(md)).toBe(md);
    });

    it("headings", () => {
      const md = "# Heading 1\n\n## Heading 2\n\n### Heading 3";
      expect(roundTrip(md)).toBe(md);
    });

    it("links", () => {
      const md = "See [the docs](https://example.com/docs).";
      expect(roundTrip(md)).toBe(md);
    });

    it("ordered lists", () => {
      const md = "1. First\n2. Second\n3. Third";
      expect(roundTrip(md)).toBe(md);
    });

    it("bullet lists", () => {
      const md = "- Apple\n- Banana\n- Cherry";
      expect(roundTrip(md)).toBe(md);
    });

    it("task lists", () => {
      const md = "- [ ] todo\n- [x] done";
      const out = roundTrip(md);
      expect(out).toContain("[ ] todo");
      expect(out).toContain("[x] done");
      // Stable on a second pass.
      expect(roundTrip(out)).toBe(out);
    });

    it("code blocks", () => {
      const md = "```ts\nconst x = 1;\n```";
      expect(roundTrip(md)).toBe(md);
    });

    it("images round-trip as a Markdown image link", () => {
      const md = "![a mockup](https://blob.example/img.png)";
      expect(roundTrip(md)).toBe(md);
      // And a doc-authored image node serialises to the same link.
      const doc = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://blob.example/shot.png", alt: "shot" },
          },
        ],
      };
      expect(docToMarkdown(doc)).toBe("![shot](https://blob.example/shot.png)");
    });

    it("strike round-trips as ~~", () => {
      const md = "A ~~struck~~ word.";
      expect(roundTrip(md)).toBe(md);
    });

    it("underline and highlight round-trip through their HTML tags", () => {
      // Markdown has no syntax for either, so the projection is <u>/<mark>
      // (see ~/lib/prd/marks). Pinned exactly: an off-editor reader — the
      // CLI, an agent, the public render — sees this string.
      const md = "An <u>underlined</u> and <mark>highlighted</mark> word.";
      expect(roundTrip(md)).toBe(md);
      // Stable on a second pass: the tags parse back to marks, not to text.
      expect(roundTrip(roundTrip(md))).toBe(md);
    });

    it("serialises doc-authored underline and highlight marks", () => {
      const doc = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", marks: [{ type: "underline" }], text: "under" },
              { type: "text", text: " " },
              { type: "text", marks: [{ type: "highlight" }], text: "high" },
            ],
          },
        ],
      };
      expect(docToMarkdown(doc)).toBe("<u>under</u> <mark>high</mark>");
    });

    it("a divider round-trips as a thematic break", () => {
      const md = "Above\n\n---\n\nBelow";
      const out = roundTrip(md);
      expect(out).toContain("Above");
      expect(out).toContain("Below");
      expect(out).toMatch(/\n-{3,}\n/);
      // And a doc-authored horizontalRule node serialises to the same break,
      // which is what the `/divider` slash command inserts.
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Above" }] },
          { type: "horizontalRule" },
          { type: "paragraph", content: [{ type: "text", text: "Below" }] },
        ],
      };
      expect(docToMarkdown(doc)).toBe(out);
      expect(roundTrip(out)).toBe(out);
    });

    it("nested lists survive and serialise stably", () => {
      const md = ["- Parent", "  - Child", "  - Child 2", "- Sibling"].join("\n");
      const out = roundTrip(md);
      // ProseMirror represents nesting structurally; assert the structure
      // survives and is idempotent rather than guessing exact indentation.
      expect(out).toContain("Parent");
      expect(out).toContain("Child");
      expect(out).toContain("Sibling");
      const doc = markdownToDoc(md);
      const list = doc.content?.[0];
      expect(list?.type).toBe("bulletList");
      expect(roundTrip(out)).toBe(out);
    });

    it("GFM tables round-trip into table nodes and back to pipe Markdown", () => {
      const md = [
        "| Name | Role |",
        "| --- | --- |",
        "| Ada | Engineer |",
        "| Grace | Admiral |",
      ].join("\n");

      // Markdown → doc yields real table nodes (not dropped text).
      const doc = markdownToDoc(md);
      const table = doc.content?.find((n) => n.type === "table");
      expect(table).toBeDefined();
      expect(table?.content?.length).toBe(3); // header + 2 body rows

      // doc → Markdown emits a GFM pipe table with a delimiter row.
      const out = docToMarkdown(doc);
      expect(out).toContain("| Name | Role |");
      expect(out).toContain("| --- | --- |");
      expect(out).toContain("| Ada | Engineer |");

      // Idempotent on a second pass.
      expect(roundTrip(out)).toBe(out);
    });

    it("a mixed document is idempotent across passes", () => {
      const md = [
        "# Title",
        "",
        "Intro with a [link](https://x.test) and **bold**.",
        "",
        "## Tasks",
        "",
        "- [ ] one",
        "- [x] two",
        "",
        "```js",
        "console.log('hi');",
        "```",
      ].join("\n");
      const once = roundTrip(md);
      expect(roundTrip(once)).toBe(once);
    });
  });

  describe("page links project to plain Markdown links", () => {
    it("serialises a pageLink node as [title](href)", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "pageLink",
            attrs: {
              pageId: "clx123",
              title: "Design notes",
              href: "/w/acme/pages/clx123",
            },
          },
        ],
      };
      expect(docToMarkdown(doc)).toBe("[Design notes](/w/acme/pages/clx123)");
    });

    it("escapes brackets in the cached title and tolerates missing attrs", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          { type: "pageLink", attrs: { pageId: "clx1", title: "A [draft]" } },
        ],
      };
      expect(docToMarkdown(doc)).toBe("[A \\[draft\\]]()");
      const hostileHref: JSONContent = {
        type: "doc",
        content: [
          {
            type: "pageLink",
            attrs: { pageId: "clx2", title: "T", href: "/w/a(b)/pages/x" },
          },
        ],
      };
      expect(docToMarkdown(hostileHref)).toBe("[T](/w/a\\(b\\)/pages/x)");
      const bare: JSONContent = {
        type: "doc",
        content: [{ type: "pageLink" }],
      };
      expect(docToMarkdown(bare)).toBe("[Untitled]()");
    });
  });

  describe("comment marks drop from the Markdown projection", () => {
    it("keeps the text but emits no comment mark/span/threadId", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Hello " },
              {
                type: "text",
                text: "anchored",
                marks: [{ type: "comment", attrs: { threadId: "thread-123" } }],
              },
              { type: "text", text: " world!" },
            ],
          },
        ],
      };
      const md = docToMarkdown(doc);
      expect(md).toBe("Hello anchored world!");
      expect(md).not.toContain("thread-123");
      expect(md).not.toContain("data-comment-thread");
      expect(md.toLowerCase()).not.toContain("<span");
    });

    it("a comment mark combined with bold still drops the comment but keeps bold", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "important",
                marks: [
                  { type: "bold" },
                  { type: "comment", attrs: { threadId: "t9" } },
                ],
              },
            ],
          },
        ],
      };
      const md = docToMarkdown(doc);
      expect(md).toBe("**important**");
    });
  });

  describe("isDocEmpty", () => {
    it("treats the empty doc and null as empty", () => {
      expect(isDocEmpty(EMPTY_DOC)).toBe(true);
      expect(isDocEmpty(null)).toBe(true);
      expect(isDocEmpty(markdownToDoc(""))).toBe(true);
    });

    it("treats real content as non-empty", () => {
      expect(isDocEmpty(markdownToDoc("Something"))).toBe(false);
    });
  });
});
