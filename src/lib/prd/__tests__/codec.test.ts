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

    it("mermaid fences keep their language, which the editor draws as a diagram", () => {
      const md = "```mermaid\nflowchart LR\n  A --> B\n```";
      expect(markdownToDoc(md).content?.[0]).toMatchObject({
        type: "codeBlock",
        attrs: { language: "mermaid" },
      });
      expect(roundTrip(md)).toBe(md);
    });

    it("a fence directly under a raw HTML line is still a code block", () => {
      // Without the blank line CommonMark keeps the fence lines inside the
      // HTML block and the closing fence swallows the rest of the document.
      const md =
        '<img src="https://blob.example/shot.png" width="600" />\n' +
        "```mermaid\nflowchart TB\n  R[Root<br/>key] --> L\n```\n\n" +
        "Prose after.\n\n```mermaid\nflowchart LR\n  A --> B\n```";
      const doc = markdownToDoc(md);
      expect(doc.content?.map((n) => n.type)).toEqual([
        "image",
        "codeBlock",
        "paragraph",
        "codeBlock",
      ]);
      expect(doc.content?.[1]).toMatchObject({
        attrs: { language: "mermaid" },
        content: [{ text: "flowchart TB\n  R[Root<br/>key] --> L" }],
      });
      expect(doc.content?.[2]).toMatchObject({
        content: [{ text: "Prose after." }],
      });
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

  describe("the bubble menu's marks and the block menu's blocks", () => {
    const para = (...content: JSONContent[]): JSONContent => ({
      type: "doc",
      content: [{ type: "paragraph", content }],
    });
    const marked = (text: string, mark: string): JSONContent => ({
      type: "text",
      text,
      marks: [{ type: mark }],
    });
    /** The marks on each text run of the first paragraph. */
    const runMarks = (doc: JSONContent) =>
      doc.content?.[0]?.content?.map((n) => ({
        text: n.text,
        marks: (n.marks ?? []).map((m) => m.type),
      }));

    it("strike is native Markdown (~~) in both directions", () => {
      const md = "A ~~struck~~ word.";
      expect(runMarks(markdownToDoc(md))).toContainEqual({
        text: "struck",
        marks: ["strike"],
      });
      expect(roundTrip(md)).toBe(md);
      expect(docToMarkdown(para(marked("gone", "strike")))).toBe("~~gone~~");
    });

    it("underline and highlight parse from their HTML tags into marks", () => {
      // Markdown has no syntax for either, so the projection is <u>/<mark>
      // (~/lib/prd/marks); markdown-it hands the tags to Tiptap's parseHTML.
      const doc = markdownToDoc("An <u>underlined</u> and <mark>highlighted</mark> word.");
      const runs = runMarks(doc);
      expect(runs).toContainEqual({ text: "underlined", marks: ["underline"] });
      expect(runs).toContainEqual({ text: "highlighted", marks: ["highlight"] });
      // The tags became marks, not literal text.
      expect(JSON.stringify(doc)).not.toContain("<u>");
      expect(JSON.stringify(doc)).not.toContain("<mark>");
    });

    it("underline and highlight round-trip through their HTML tags exactly", () => {
      // Pinned exactly: off-editor readers (the CLI, agents) see this string.
      const md = "An <u>underlined</u> and <mark>highlighted</mark> word.";
      expect(roundTrip(md)).toBe(md);
      expect(roundTrip(roundTrip(md))).toBe(md);
    });

    it("serialises doc-authored underline and highlight marks", () => {
      const doc = para(
        marked("under", "underline"),
        { type: "text", text: " " },
        marked("high", "highlight"),
      );
      const md = docToMarkdown(doc);
      expect(md).toBe("<u>under</u> <mark>high</mark>");
      // And back: the same marks on the same text.
      expect(runMarks(markdownToDoc(md))).toEqual(runMarks(doc));
    });

    it("stacked marks survive together", () => {
      const doc = para({
        type: "text",
        text: "all three",
        marks: [{ type: "underline" }, { type: "strike" }, { type: "highlight" }],
      });
      const md = docToMarkdown(doc);
      const back = runMarks(markdownToDoc(md));
      expect(back).toHaveLength(1);
      expect(back?.[0]?.text).toBe("all three");
      expect([...(back?.[0]?.marks ?? [])].sort()).toEqual(["highlight", "strike", "underline"]);
      expect(roundTrip(md)).toBe(md);
    });

    it("a divider round-trips as a thematic break", () => {
      const md = "Above\n\n---\n\nBelow";
      expect(markdownToDoc(md).content?.map((n) => n.type)).toEqual([
        "paragraph",
        "horizontalRule",
        "paragraph",
      ]);
      const out = roundTrip(md);
      expect(out).toMatch(/\n-{3,}\n/);
      expect(roundTrip(out)).toBe(out);
      // A doc-authored horizontalRule node (what `/divider` inserts)
      // serialises to the same break.
      const doc: JSONContent = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Above" }] },
          { type: "horizontalRule" },
          { type: "paragraph", content: [{ type: "text", text: "Below" }] },
        ],
      };
      expect(docToMarkdown(doc)).toBe(out);
    });

    it("an /image node (src only) round-trips as a Markdown image", () => {
      const src = "https://blob.example/screenshots/pages/p1/upload.png";
      const doc: JSONContent = { type: "doc", content: [{ type: "image", attrs: { src } }] };
      const md = docToMarkdown(doc);
      expect(md).toBe(`![](${src})`);
      expect(markdownToDoc(md).content?.[0]).toMatchObject({ type: "image", attrs: { src } });
      expect(roundTrip(md)).toBe(md);
    });

    it("comment marks still drop when they overlap the new marks", () => {
      const doc = para({
        type: "text",
        text: "noted",
        marks: [{ type: "highlight" }, { type: "comment", attrs: { threadId: "t1" } }],
      });
      expect(docToMarkdown(doc)).toBe("<mark>noted</mark>");
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
