/**
 * The summary that lands in a Matrix room must not leak raw Markdown: the
 * summarizer's `detailed_breakdown` is a `##`-sectioned write-up with `**bold**`
 * and nested bullets, Matrix renders neither, so the HTML body converts it to
 * real tags and the text body strips it to plain text.
 */

import { describe, it, expect } from "vitest";

import {
  extractSummarySections,
  markdownToMatrixHtml,
  markdownToPlainText,
  renderMeetingSummary,
  type MeetingForSummary,
} from "~/server/services/matrix/renderMeetingSummary";

const BREAKDOWN = [
  "## clear-pipeline shared with Ewan",
  "- **Update:** A seismic ingestion approach was shared.",
  "- **Decision:** Await feedback before updating the API schema.",
  "",
  "## Action Items",
  "**James**",
  "- Provide guidance on Notion access.",
  "  - Including the delivery playbook.",
].join("\n");

function meeting(summary: string | null): MeetingForSummary {
  return {
    id: "meeting-1",
    title: "Weekly sync",
    summary,
    meetingDate: new Date("2026-08-10T10:00:00Z"),
    createdAt: new Date("2026-08-10T10:00:00Z"),
    workspaceId: "ws-1",
    project: { id: "proj-1", name: "Apollo" },
    actions: [],
  };
}

describe("markdownToMatrixHtml", () => {
  it("renders headings as bold paragraphs, below the message's own titles", () => {
    const html = markdownToMatrixHtml("## Section One\nSome prose.");
    expect(html).toContain("<p><strong>Section One</strong></p>");
    expect(html).not.toContain("##");
    // The message reserves h4 (title) and h5 (section labels) for itself.
    expect(html).not.toMatch(/<h[1-6]/);
  });

  it("converts bullets to a list and nests by indentation", () => {
    const html = markdownToMatrixHtml("- top\n  - nested\n- second");
    expect(html).toBe("<ul><li>top<ul><li>nested</li></ul></li><li>second</li></ul>");
  });

  it("converts inline markup", () => {
    const html = markdownToMatrixHtml(
      "**Decision:** use `remark` — see [docs](https://example.org/docs)",
    );
    expect(html).toContain("<strong>Decision:</strong>");
    expect(html).toContain("<code>remark</code>");
    expect(html).toContain('<a href="https://example.org/docs">docs</a>');
    expect(html).not.toContain("**");
  });

  it("escapes HTML in the source text", () => {
    const html = markdownToMatrixHtml("- <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("joins consecutive prose lines into one paragraph with line breaks", () => {
    expect(markdownToMatrixHtml("line one\nline two\n\nnext para")).toBe(
      "<p>line one<br/>line two</p><p>next para</p>",
    );
  });

  it("keeps loosely-spaced bullets in one list", () => {
    expect(markdownToMatrixHtml("- one\n\n- two")).toBe(
      "<ul><li>one</li><li>two</li></ul>",
    );
  });

  it("renders numbered lists as ordered lists", () => {
    expect(markdownToMatrixHtml("1. first\n2. second")).toBe(
      "<ol><li>first</li><li>second</li></ol>",
    );
  });

  it("nests tab-indented bullets", () => {
    expect(markdownToMatrixHtml("- top\n\t- nested")).toBe(
      "<ul><li>top<ul><li>nested</li></ul></li></ul>",
    );
  });

  it("passes fenced code through verbatim instead of parsing it as structure", () => {
    const html = markdownToMatrixHtml("```\n# not a heading\n- not a bullet\n```");
    expect(html).toBe("<pre><code># not a heading\n- not a bullet</code></pre>");
  });
});

describe("markdownToPlainText", () => {
  it("strips heading markers and inline markup, keeps bullets readable", () => {
    const text = markdownToPlainText(BREAKDOWN);
    expect(text).not.toContain("##");
    expect(text).not.toContain("**");
    expect(text).toContain("clear-pipeline shared with Ewan");
    expect(text).toContain("• Update: A seismic ingestion approach was shared.");
    expect(text).toContain("  • Including the delivery playbook.");
  });

  it("keeps fenced code content verbatim, dropping only the fence markers", () => {
    expect(markdownToPlainText("```\n# kept as-is\n```")).toBe("# kept as-is");
  });

  it("keeps numbered markers as written, stripping only inline markup", () => {
    expect(markdownToPlainText("1. **First** thing")).toBe("1. First thing");
  });
});

describe("extractSummarySections", () => {
  it("splits a Fireflies-shaped summary into humanized sections in order", () => {
    const sections = extractSummarySections(
      JSON.stringify({
        overview: "What happened.",
        detailed_breakdown: BREAKDOWN,
        shorthand_bullet: ["one", "two"],
      }),
    );
    expect(sections.map((s) => s.title)).toEqual([
      "Overview",
      "Detailed breakdown",
      "Shorthand bullet",
    ]);
    // Arrays become markdown bullets so both emitters format them uniformly.
    expect(sections[2]!.content).toBe("- one\n- two");
  });

  it("treats a non-JSON summary as a single untitled prose section", () => {
    expect(extractSummarySections("Just some notes.")).toEqual([
      { title: null, content: "Just some notes." },
    ]);
  });

  it("falls back to the raw string for an object with no usable prose", () => {
    const raw = JSON.stringify({ transcript_chapters: [{ title: "x" }] });
    expect(extractSummarySections(raw)).toEqual([{ title: null, content: raw }]);
  });
});

describe("renderMeetingSummary", () => {
  it("emits section labels as h5 and converted markdown in the HTML body", () => {
    const { html } = renderMeetingSummary(
      meeting(JSON.stringify({ overview: "Short.", detailed_breakdown: BREAKDOWN })),
    );
    expect(html).toContain("<h4>📋 Weekly sync</h4>");
    expect(html).toContain("<h5>Overview</h5>");
    expect(html).toContain("<h5>Detailed breakdown</h5>");
    expect(html).toContain("<p><strong>clear-pipeline shared with Ewan</strong></p>");
    expect(html).toContain("<li><strong>Update:</strong>");
    expect(html).not.toContain("##");
    expect(html).not.toContain("**");
  });

  it("keeps the text body free of markdown markers", () => {
    const { text } = renderMeetingSummary(
      meeting(JSON.stringify({ overview: "Short.", detailed_breakdown: BREAKDOWN })),
    );
    expect(text).toContain("Overview\nShort.");
    expect(text).toContain("Detailed breakdown\nclear-pipeline shared with Ewan");
    expect(text).not.toContain("##");
    expect(text).not.toContain("**");
  });

  it("still renders a plain prose summary verbatim", () => {
    const { text, html } = renderMeetingSummary(meeting("We agreed to ship on Friday."));
    expect(text).toContain("We agreed to ship on Friday.");
    expect(html).toContain("<p>We agreed to ship on Friday.</p>");
  });

  it("emits no stray blank block when the meeting has no summary", () => {
    const { text } = renderMeetingSummary(meeting(null));
    expect(text).not.toContain("\n\n\n");
  });
});
