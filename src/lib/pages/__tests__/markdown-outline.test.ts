import { describe, it, expect } from "vitest";
import {
  extractMarkdownSection,
  markdownBytes,
  markdownOutline,
} from "../markdown-outline";

const DOC = [
  "# Strategy",
  "",
  "Intro paragraph.",
  "",
  "## Goals",
  "",
  "- Grow",
  "",
  "### Q4",
  "",
  "Ship it.",
  "",
  "```md",
  "# not a heading",
  "```",
  "",
  "## Risks ##",
  "",
  "Some risk.",
].join("\n");

describe("markdownOutline", () => {
  it("lists ATX headings with level and line, skipping fenced code", () => {
    expect(markdownOutline(DOC)).toEqual([
      { level: 1, text: "Strategy", line: 0 },
      { level: 2, text: "Goals", line: 4 },
      { level: 3, text: "Q4", line: 8 },
      { level: 2, text: "Risks", line: 16 },
    ]);
  });

  it("returns an empty outline for a page without headings", () => {
    expect(markdownOutline("just prose\n\nmore prose")).toEqual([]);
  });
});

describe("extractMarkdownSection", () => {
  it("returns the heading through to the next heading of the same or higher level", () => {
    const section = extractMarkdownSection(DOC, "Goals");
    expect(section?.heading).toEqual({ level: 2, text: "Goals", line: 4 });
    // The H3 under Goals belongs to it; the next H2 does not.
    expect(section?.body).toBe(
      ["## Goals", "", "- Grow", "", "### Q4", "", "Ship it.", "", "```md", "# not a heading", "```"].join("\n"),
    );
  });

  it("matches case-insensitively and tolerates a pasted `## ` prefix", () => {
    expect(extractMarkdownSection(DOC, "## goals")?.heading.text).toBe("Goals");
    expect(extractMarkdownSection(DOC, "risks")?.body).toBe("## Risks ##\n\nSome risk.");
  });

  it("falls back to a prefix match and returns null when nothing matches", () => {
    expect(extractMarkdownSection(DOC, "Ri")?.heading.text).toBe("Risks");
    expect(extractMarkdownSection(DOC, "Budget")).toBeNull();
    expect(extractMarkdownSection(DOC, "   ")).toBeNull();
  });

  it("runs the last section to the end of the document", () => {
    expect(extractMarkdownSection(DOC, "Q4")?.body).toBe(
      ["### Q4", "", "Ship it.", "", "```md", "# not a heading", "```"].join("\n"),
    );
  });
});

describe("markdownBytes", () => {
  it("counts UTF-8 bytes and treats null as empty", () => {
    expect(markdownBytes(null)).toBe(0);
    expect(markdownBytes("abc")).toBe(3);
    expect(markdownBytes("é")).toBe(2);
  });
});
