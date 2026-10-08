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
  MAX_LISTED_ITEMS,
  renderMeetingSummary,
  type MeetingActionForSummary,
  type MeetingDecisionForSummary,
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

function meeting(
  summary: string | null,
  decisions: MeetingDecisionForSummary[] = [],
  actions: MeetingActionForSummary[] = [],
): MeetingForSummary {
  return {
    id: "meeting-1",
    title: "Weekly sync",
    summary,
    meetingDate: new Date("2026-08-10T10:00:00Z"),
    createdAt: new Date("2026-08-10T10:00:00Z"),
    workspaceId: "ws-1",
    project: { id: "proj-1", name: "Apollo" },
    actions,
    decisions,
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

  describe("decisions", () => {
    const decisions: MeetingDecisionForSummary[] = [
      { number: 42, statement: "Keep backups for one month.", status: "ACCEPTED" },
      { number: 43, statement: "Should DataMiner get a severity layer?", status: "OPEN" },
    ];
    const summary = JSON.stringify({ overview: "Short.", detailed_breakdown: BREAKDOWN });

    it("leads with the decisions, above the summary sections", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, decisions));
      expect(text.indexOf("⚖️ Decisions (1)")).toBeLessThan(text.indexOf("Overview"));
      expect(html.indexOf("<h5>⚖️ Decisions (1)</h5>")).toBeLessThan(
        html.indexOf("<h5>Overview</h5>"),
      );
      expect(text).toContain("• D-0042 Keep backups for one month.");
      expect(html).toContain("<li><strong>D-0042</strong> Keep backups for one month.</li>");
    });

    it("links to the meeting's Decisions tab", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, decisions));
      // The link sits on a line of its own, with nothing else beside it.
      expect(text).toMatch(/\nhttps?:\/\/\S+\/recording\/meeting-1\?tab=outputs\n/);
      expect(html).toMatch(/<a href="[^"]+\/recording\/meeting-1\?tab=outputs">/);
    });

    it("lists open questions under their own heading, after the decisions", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, decisions));
      expect(text).toContain(
        "❓ Open questions (1)\n• D-0043 Should DataMiner get a severity layer?",
      );
      expect(text.indexOf("⚖️ Decisions")).toBeLessThan(text.indexOf("❓ Open questions"));
      expect(text.indexOf("❓ Open questions")).toBeLessThan(text.indexOf("Overview"));
      expect(html).toContain(
        "<h5>❓ Open questions (1)</h5><ul><li><strong>D-0043</strong> Should DataMiner get a severity layer?</li></ul>",
      );
      // An open question is not listed as a decision, nor tagged "(open)".
      expect(text).toContain("⚖️ Decisions (1)");
      expect(text).not.toContain("(open)");
    });

    it("links even when the meeting only raised open questions", () => {
      const { text } = renderMeetingSummary(meeting(summary, [decisions[1]!]));
      expect(text).not.toContain("⚖️ Decisions");
      expect(text).toContain("❓ Open questions (1)");
      expect(text).toContain("?tab=outputs");
    });

    it("caps the list and leaves the rest to the link", () => {
      const many = Array.from({ length: MAX_LISTED_ITEMS + 3 }, (_, i) => ({
        number: i + 1,
        statement: `Decision ${i + 1}`,
        status: "ACCEPTED",
      }));
      const { text } = renderMeetingSummary(meeting(summary, many));
      expect(text).toContain(`⚖️ Decisions (${MAX_LISTED_ITEMS + 3})`);
      expect(text).toContain("• …and 3 more");
      expect(text).not.toContain(`Decision ${MAX_LISTED_ITEMS + 1}`);
    });

    it("marks every decision that is not accepted with its status", () => {
      const { text, html } = renderMeetingSummary(
        meeting(summary, [
          { number: 1, statement: "Use GPT for severity.", status: "PROPOSED" },
          { number: 2, statement: "Rename to dev-app.", status: "SUPERSEDED" },
          { number: 3, statement: "Keep backups.", status: "ACCEPTED" },
        ]),
      );
      expect(text).toContain("• D-0001 Use GPT for severity. (proposed)");
      expect(text).toContain("• D-0002 Rename to dev-app. (superseded)");
      expect(text).toContain("• D-0003 Keep backups.\n");
      expect(html).toContain("Use GPT for severity. <em>(proposed)</em></li>");
      expect(html).toContain("Keep backups.</li>");
    });

    it("escapes decision statements in the HTML body", () => {
      const { html } = renderMeetingSummary(
        meeting(summary, [{ number: 1, statement: "<b>bold</b>", status: "ACCEPTED" }]),
      );
      expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    });

    it("omits the block when nothing was decided", () => {
      const { text, html } = renderMeetingSummary(meeting(summary));
      expect(text).not.toContain("tab=outputs");
      expect(html).not.toContain("Decisions (");
    });
  });

  describe("action items", () => {
    const summary = JSON.stringify({ overview: "Short." });
    const actions: MeetingActionForSummary[] = [
      {
        id: "a1",
        name: "Set up pipeline monitoring",
        assignees: [{ user: { name: "Raj" } }, { user: { name: "James" } }],
      },
      { id: "a2", name: "Schedule severity meeting", assignees: [] },
    ];

    it("lists each action with its owners, after decisions and before the summary", () => {
      const decisions: MeetingDecisionForSummary[] = [
        { number: 1, statement: "Keep backups.", status: "ACCEPTED" },
      ];
      const { text, html } = renderMeetingSummary(meeting(summary, decisions, actions));
      expect(text).toContain(
        "✅ Action items (2)\n• Set up pipeline monitoring — Raj, James\n• Schedule severity meeting\n",
      );
      expect(text.indexOf("⚖️ Decisions")).toBeLessThan(text.indexOf("✅ Action items"));
      expect(text.indexOf("✅ Action items")).toBeLessThan(text.indexOf("Overview"));
      expect(html).toContain(
        "<h5>✅ Action items (2)</h5><ul><li>Set up pipeline monitoring — <em>Raj, James</em></li><li>Schedule severity meeting</li></ul>",
      );
    });

    it("caps the list", () => {
      const many = Array.from({ length: MAX_LISTED_ITEMS + 2 }, (_, i) => ({
        id: `a${i}`,
        name: `Action ${i + 1}`,
        assignees: [],
      }));
      const { text } = renderMeetingSummary(meeting(summary, [], many));
      expect(text).toContain("• …and 2 more");
      expect(text).not.toContain(`Action ${MAX_LISTED_ITEMS + 1}`);
    });

    it("escapes action names in the HTML body", () => {
      const { html } = renderMeetingSummary(
        meeting(summary, [], [{ id: "a", name: "<img src=x>", assignees: [] }]),
      );
      expect(html).toContain("&lt;img src=x&gt;");
    });

    it("omits the block when the meeting produced no actions", () => {
      const { text, html } = renderMeetingSummary(meeting(summary));
      expect(text).not.toContain("Action items");
      expect(html).not.toContain("Action items");
    });
  });
});
