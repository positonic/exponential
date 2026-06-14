import { describe, it, expect } from "vitest";

import { detectContentType } from "../contentFormat";

// ── detectContentType ────────────────────────────────────────────────

describe("detectContentType", () => {
  describe("HTML", () => {
    it("detects block HTML from the legacy editors", () => {
      expect(detectContentType("<p>hello</p>")).toBe("html");
      expect(detectContentType("<h1>Title</h1><ul><li>a</li></ul>")).toBe(
        "html",
      );
    });

    it("detects HTML even with attributes", () => {
      expect(detectContentType('<a href="https://x.com">x</a>')).toBe("html");
      expect(detectContentType('<div class="foo">bar</div>')).toBe("html");
    });

    it("wins over Markdown when both are present (legacy content)", () => {
      // Tiptap output can contain stray markdown-looking text inside tags.
      expect(detectContentType("<p>use **bold** here</p>")).toBe("html");
    });

    it("does not treat a lone angle bracket as HTML", () => {
      expect(detectContentType("3 < 5 and 5 > 3")).toBe("text");
    });
  });

  describe("Markdown", () => {
    it("detects ATX headings", () => {
      expect(detectContentType("# Strategic Update\nbody")).toBe("markdown");
    });

    it("detects unordered and ordered lists", () => {
      expect(detectContentType("- point one\n- point two")).toBe("markdown");
      expect(detectContentType("1. first\n2. second")).toBe("markdown");
    });

    it("detects bold and inline code", () => {
      expect(detectContentType("this is **important**")).toBe("markdown");
      expect(detectContentType("run `npm run check`")).toBe("markdown");
    });

    it("detects links", () => {
      expect(detectContentType("see [docs](https://x.com)")).toBe("markdown");
    });

    it("detects fenced code blocks", () => {
      expect(detectContentType("```ts\nconst a = 1;\n```")).toBe("markdown");
    });

    it("detects blockquotes and tables", () => {
      expect(detectContentType("> a quote")).toBe("markdown");
      expect(detectContentType("| a | b |\n| - | - |")).toBe("markdown");
    });

    it("detects the realistic goal-update case (the reported bug)", () => {
      const update =
        "# Strategic Update\n\nAfter analysis:\n\n- Carrying debt\n- Working 7 days/week\n\n**Why:** can't control what you don't see.";
      expect(detectContentType(update)).toBe("markdown");
    });
  });

  describe("plain text", () => {
    it("treats an empty string as text", () => {
      expect(detectContentType("")).toBe("text");
    });

    it("treats ordinary prose as text", () => {
      expect(detectContentType("Just a normal sentence about my day.")).toBe(
        "text",
      );
    });

    it("does not mistake a stray asterisk for italic", () => {
      expect(detectContentType("the rating was 4 * out of 5")).toBe("text");
    });

    it("does not mistake an email's @ for anything", () => {
      expect(detectContentType("ping me at jane@example.com")).toBe("text");
    });
  });
});
