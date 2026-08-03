import { describe, it, expect } from "vitest";

import { detectContentType, htmlToMarkdown } from "../contentFormat";

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

// ── htmlToMarkdown ───────────────────────────────────────────────────

describe("htmlToMarkdown", () => {
  it("returns an empty string for empty / whitespace-only input", () => {
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("   \n  ")).toBe("");
  });

  it("converts headings to ATX style", () => {
    expect(htmlToMarkdown("<h1>Title</h1>")).toBe("# Title");
    expect(htmlToMarkdown("<h3>Sub</h3>")).toBe("### Sub");
  });

  it("converts bold and italic to Markdown emphasis", () => {
    expect(htmlToMarkdown("<p><strong>bold</strong></p>")).toBe("**bold**");
    expect(htmlToMarkdown("<p><em>italic</em></p>")).toBe("*italic*");
  });

  it("converts links inline", () => {
    expect(htmlToMarkdown('<p>see <a href="https://x.com">docs</a></p>')).toBe(
      "see [docs](https://x.com)",
    );
  });

  it("converts unordered lists with a dash marker", () => {
    expect(htmlToMarkdown("<ul><li>one</li><li>two</li></ul>")).toBe(
      "- one\n- two",
    );
  });

  it("converts ordered lists", () => {
    expect(htmlToMarkdown("<ol><li>first</li><li>second</li></ol>")).toBe(
      "1. first\n2. second",
    );
  });

  it("converts nested lists", () => {
    const html =
      "<ul><li>parent<ul><li>child</li></ul></li><li>sibling</li></ul>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("- parent");
    expect(md).toMatch(/\n\s+- child/); // indented child bullet
    expect(md).toContain("- sibling");
  });

  it("converts inline code and fenced code blocks", () => {
    expect(htmlToMarkdown("<p>run <code>npm run check</code></p>")).toBe(
      "run `npm run check`",
    );
    const md = htmlToMarkdown("<pre><code>const a = 1;</code></pre>");
    expect(md).toContain("```");
    expect(md).toContain("const a = 1;");
  });

  it("converts a table to a GFM pipe table", () => {
    const html =
      "<table><thead><tr><th>a</th><th>b</th></tr></thead>" +
      "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("| a | b |");
    expect(md).toMatch(/\| ?-+ ?\|/); // header separator row
    expect(md).toContain("| 1 | 2 |");
  });

  it("degrades unrepresentable inline tags to their text", () => {
    // <u> (underline) and <mark> (highlight) have no Markdown equivalent.
    expect(htmlToMarkdown("<p><u>underlined</u></p>")).toBe("underlined");
    expect(htmlToMarkdown("<p><mark>highlit</mark></p>")).toBe("highlit");
  });

  it("round-trips a realistic legacy Tiptap goal description", () => {
    const html =
      "<h2>Strategic Update</h2><p>After <strong>analysis</strong>:</p>" +
      "<ul><li>Carrying debt</li><li>Working 7 days/week</li></ul>" +
      '<p>See <a href="https://x.com">the doc</a>.</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("## Strategic Update");
    expect(md).toContain("After **analysis**:");
    expect(md).toContain("- Carrying debt");
    expect(md).toContain("- Working 7 days/week");
    expect(md).toContain("[the doc](https://x.com)");
    // The output is Markdown, so it must classify as such.
    expect(detectContentType(md)).toBe("markdown");
  });
});
