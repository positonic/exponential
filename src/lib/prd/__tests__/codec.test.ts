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
