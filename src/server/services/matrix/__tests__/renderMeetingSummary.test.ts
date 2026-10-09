/**
 * The summary that lands in a Matrix room must not leak raw Markdown: the
 * summarizer's `detailed_breakdown` is a `##`-sectioned write-up with `**bold**`
 * and nested bullets, Matrix renders neither, so the HTML body converts it to
 * real tags and the text body strips it to plain text.
 */

import { describe, it, expect } from "vitest";

import {
  markdownToMatrixHtml,
  markdownToPlainText,
  MAX_LISTED_ITEMS,
  pickSummaryProse,
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

describe("pickSummaryProse", () => {
  it("prefers the overview over every other field", () => {
    expect(
      pickSummaryProse(
        JSON.stringify({
          keywords: ["a"],
          action_items: ["Raj: ship it"],
          detailed_breakdown: BREAKDOWN,
          overview: "What happened.",
        }),
      ),
    ).toBe("What happened.");
  });

  it("falls back to the detailed breakdown when there is no short prose", () => {
    expect(pickSummaryProse(JSON.stringify({ detailed_breakdown: BREAKDOWN }))).toBe(
      BREAKDOWN,
    );
  });

  it("turns a bullet-array field into markdown bullets", () => {
    expect(pickSummaryProse(JSON.stringify({ shorthand_bullet: ["one", "two"] }))).toBe(
      "- one\n- two",
    );
  });

  it("never posts the summarizer's own action list", () => {
    expect(
      pickSummaryProse(JSON.stringify({ action_items: ["Raj: ship it"], keywords: ["x"] })),
    ).toBeNull();
  });

  it("treats a non-JSON summary as the prose itself", () => {
    expect(pickSummaryProse("Just some notes.")).toBe("Just some notes.");
  });

  it("returns null for an object with no usable prose rather than its raw JSON", () => {
    expect(pickSummaryProse(JSON.stringify({ transcript_chapters: [{ title: "x" }] }))).toBeNull();
  });
});

describe("renderMeetingSummary", () => {
  const summary = JSON.stringify({
    overview: "Short.",
    detailed_breakdown: BREAKDOWN,
    action_items: ["Summarizer's own unreviewed item"],
  });
  const decisions: MeetingDecisionForSummary[] = [
    { number: 42, statement: "Keep backups for one month.", status: "ACCEPTED" },
    { number: 43, statement: "Should DataMiner get a severity layer?", status: "OPEN" },
  ];
  const actions: MeetingActionForSummary[] = [
    {
      id: "a1",
      name: "Set up pipeline monitoring",
      assignees: [{ user: { name: "Raj" } }, { user: { name: "James" } }],
    },
    { id: "a2", name: "Schedule severity meeting", assignees: [] },
  ];

  describe("summary", () => {
    it("posts one prose field, last, under a Summary label below a rule", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, decisions, actions));
      expect(text).toContain("──────────\nSummary\nShort.");
      expect(html).toContain("<hr/><h6>Summary</h6><p>Short.</p>");
      expect(text.indexOf("❓ Open questions")).toBeLessThan(text.indexOf("Summary"));
      // The other fields stay on the meeting page.
      expect(text).not.toContain("clear-pipeline");
      expect(text).not.toContain("Summarizer's own unreviewed item");
    });

    it("converts a markdown breakdown in both bodies", () => {
      const { text, html } = renderMeetingSummary(
        meeting(JSON.stringify({ detailed_breakdown: BREAKDOWN })),
      );
      expect(html).toContain("<h4>📋 Weekly sync</h4>");
      expect(html).toContain("<p><strong>clear-pipeline shared with Ewan</strong></p>");
      expect(html).toContain("<li><strong>Update:</strong>");
      expect(text).toContain("Summary\nclear-pipeline shared with Ewan");
      for (const body of [text, html]) {
        expect(body).not.toContain("##");
        expect(body).not.toContain("**");
      }
    });

    it("still renders a plain prose summary verbatim", () => {
      const { text, html } = renderMeetingSummary(meeting("We agreed to ship on Friday."));
      expect(text).toContain("We agreed to ship on Friday.");
      expect(html).toContain("<p>We agreed to ship on Friday.</p>");
    });

    it("emits no summary label or stray blank block without prose", () => {
      const { text, html } = renderMeetingSummary(meeting(null));
      expect(text).not.toContain("\n\n\n");
      expect(text).not.toContain("Summary");
      expect(html).not.toContain("<hr/>");
    });
  });

  describe("tally", () => {
    it("names all three output types under the title", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, decisions, actions));
      expect(text).toMatch(
        /^📋 Weekly sync\n2026-08-10 · Apollo\n2 actions · 1 decision · 1 open question\n/,
      );
      expect(html).toContain("<strong>2 actions · 1 decision · 1 open question</strong>");
    });

    it("keeps zeros, so an empty type reads as none rather than missing", () => {
      const { text } = renderMeetingSummary(meeting(summary));
      expect(text).toContain("0 actions · 0 decisions · 0 open questions");
    });
  });

  describe("outputs", () => {
    it("lists actions, then decisions, then open questions, all above the summary", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, decisions, actions));
      const order = ["✅ Actions (2)", "⚖️ Decisions (1)", "❓ Open questions (1)", "Summary"];
      const positions = order.map((h) => text.indexOf(h));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      // Every output type gets the same heading weight; the summary's sits below it.
      for (const h of order.slice(0, 3)) expect(html).toContain(`<h5>${h}</h5>`);
    });

    it("lists each action with its owners", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, [], actions));
      expect(text).toContain(
        "✅ Actions (2)\n• Set up pipeline monitoring — Raj, James\n• Schedule severity meeting\n",
      );
      expect(html).toContain(
        "<h5>✅ Actions (2)</h5><ul><li>Set up pipeline monitoring — <em>Raj, James</em></li><li>Schedule severity meeting</li></ul>",
      );
    });

    it("labels decisions and open questions, without tagging questions (open)", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, decisions));
      expect(text).toContain("• D-0042 Keep backups for one month.");
      expect(html).toContain("<li><strong>D-0042</strong> Keep backups for one month.</li>");
      expect(html).toContain(
        "<h5>❓ Open questions (1)</h5><ul><li><strong>D-0043</strong> Should DataMiner get a severity layer?</li></ul>",
      );
      expect(text).not.toContain("(open)");
    });

    it("links once to the Outputs tab, after all three lists", () => {
      const { text, html } = renderMeetingSummary(meeting(summary, decisions, actions));
      // The link sits on a line of its own, with nothing else beside it.
      expect(text).toMatch(
        /Review all outputs in Exponential:\nhttps?:\/\/\S+\/recording\/meeting-1\?tab=outputs\n/,
      );
      expect(text.indexOf("❓ Open questions")).toBeLessThan(text.indexOf("Review all outputs"));
      expect(text.match(/tab=outputs/g)).toHaveLength(1);
      expect(html).toMatch(
        /<a href="[^"]+\/recording\/meeting-1\?tab=outputs">Review all outputs in Exponential<\/a>/,
      );
    });

    it("links even when the meeting only raised open questions", () => {
      const { text } = renderMeetingSummary(meeting(summary, [decisions[1]!]));
      expect(text).not.toContain("⚖️ Decisions");
      expect(text).toContain("❓ Open questions (1)");
      expect(text).toContain("?tab=outputs");
    });

    it("omits the lists and the link when there are no outputs", () => {
      const { text, html } = renderMeetingSummary(meeting(summary));
      expect(text).not.toContain("tab=outputs");
      expect(html).not.toContain("<h5>");
    });

    it("caps each list and leaves the rest to the link", () => {
      const many = Array.from({ length: MAX_LISTED_ITEMS + 3 }, (_, i) => ({
        number: i + 1,
        statement: `Decision ${i + 1}`,
        status: "ACCEPTED",
      }));
      const manyActions = Array.from({ length: MAX_LISTED_ITEMS + 2 }, (_, i) => ({
        id: `a${i}`,
        name: `Action ${i + 1}`,
        assignees: [],
      }));
      const { text } = renderMeetingSummary(meeting(summary, many, manyActions));
      expect(text).toContain(`⚖️ Decisions (${MAX_LISTED_ITEMS + 3})`);
      expect(text).toContain("• …and 3 more");
      expect(text).toContain("• …and 2 more");
      expect(text).not.toContain(`Decision ${MAX_LISTED_ITEMS + 1}`);
      expect(text).not.toContain(`Action ${MAX_LISTED_ITEMS + 1}`);
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

    it("escapes statements and action names in the HTML body", () => {
      const { html } = renderMeetingSummary(
        meeting(
          summary,
          [{ number: 1, statement: "<b>bold</b>", status: "ACCEPTED" }],
          [{ id: "a", name: "<img src=x>", assignees: [] }],
        ),
      );
      expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
      expect(html).toContain("&lt;img src=x&gt;");
    });
  });
});
