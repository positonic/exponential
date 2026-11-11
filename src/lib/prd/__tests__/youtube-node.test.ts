/**
 * The `youtube` embed node: a watch URL alone on its line in Markdown, a
 * validated video id in the doc, and an iframe rebuilt from that id.
 */
import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { generateHTML } from "@tiptap/html";

import { docToMarkdown, markdownToDoc } from "../codec";
import { PRD_EXTENSIONS } from "../extensions";
import { parseYouTubeStart, parseYouTubeUrl } from "../youtube";
import { sanitizeDocForPublic } from "~/lib/pages/public-doc";

const ID = "dQw4w9WgXcQ";
const nodesOf = (doc: JSONContent) => (doc.content ?? []).map((n) => n.type);

describe("parseYouTubeUrl", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, { videoId: ID }],
    [`https://youtube.com/watch?feature=share&v=${ID}`, { videoId: ID }],
    [`https://m.youtube.com/watch?v=${ID}&t=90`, { videoId: ID, start: 90 }],
    [`https://youtu.be/${ID}?t=1m30s`, { videoId: ID, start: 90 }],
    [`https://www.youtube.com/shorts/${ID}`, { videoId: ID }],
    [`https://www.youtube.com/embed/${ID}?start=12`, { videoId: ID, start: 12 }],
    [`https://www.youtube-nocookie.com/embed/${ID}`, { videoId: ID }],
    [`https://www.youtube.com/live/${ID}`, { videoId: ID }],
    [`youtube.com/watch?v=${ID}`, { videoId: ID }],
  ])("reads %s", (url, expected) => {
    expect(parseYouTubeUrl(url)).toEqual(expected);
  });

  it.each([
    "https://www.youtube.com/",
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/watch?v=short",
    `https://evil.example/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `javascript:alert(1)//youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID} trailing words`,
    "",
  ])("rejects %s", (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });

  it("reads start offsets in seconds and h/m/s forms", () => {
    expect(parseYouTubeStart("45")).toBe(45);
    expect(parseYouTubeStart("45s")).toBe(45);
    expect(parseYouTubeStart("1h2m3s")).toBe(3723);
    expect(parseYouTubeStart("0")).toBeUndefined();
    expect(parseYouTubeStart("abc")).toBeUndefined();
  });
});

describe("youtube node", () => {
  it("serialises to the watch URL on its own line", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Watch this:" }] },
        { type: "youtube", attrs: { videoId: ID, start: 90 } },
        { type: "paragraph", content: [{ type: "text", text: "After." }] },
      ],
    };
    expect(docToMarkdown(doc)).toBe(
      `Watch this:\n\nhttps://www.youtube.com/watch?v=${ID}&t=90s\n\nAfter.`,
    );
  });

  it("parses a bare YouTube URL on its own line into the node", () => {
    const doc = markdownToDoc(`Intro.\n\nhttps://youtu.be/${ID}?t=30\n\nAfter.`);
    expect(nodesOf(doc)).toEqual(["paragraph", "youtube", "paragraph"]);
    expect(doc.content?.[1]?.attrs).toEqual({ videoId: ID, start: 30 });
  });

  it("parses an angle-bracket autolink into the node", () => {
    const doc = markdownToDoc(`<https://www.youtube.com/watch?v=${ID}>`);
    expect(nodesOf(doc)).toEqual(["youtube"]);
  });

  it("round-trips through Markdown", () => {
    const markdown = `# Demo\n\nhttps://www.youtube.com/watch?v=${ID}\n\nNotes.`;
    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
  });

  it("leaves a named link, a link in a sentence and a non-video link alone", () => {
    const doc = markdownToDoc(
      [
        `[My talk](https://youtu.be/${ID})`,
        `See https://youtu.be/${ID} for the demo.`,
        "https://www.youtube.com/@somechannel",
        `- https://youtu.be/${ID}`,
      ].join("\n\n"),
    );
    expect(nodesOf(doc)).toEqual(["paragraph", "paragraph", "paragraph", "bulletList"]);
  });

  it("renders a privacy-enhanced iframe built from the video id", () => {
    const html = generateHTML(
      { type: "doc", content: [{ type: "youtube", attrs: { videoId: ID, start: 5 } }] },
      PRD_EXTENSIONS,
    );
    expect(html).toContain(`src="https://www.youtube-nocookie.com/embed/${ID}?start=5"`);
    expect(html).toContain('data-type="youtube"');
  });

  it("renders no iframe for an invalid stored id", () => {
    const html = generateHTML(
      {
        type: "doc",
        content: [{ type: "youtube", attrs: { videoId: '"><script>x</script>' } }],
      },
      PRD_EXTENSIONS,
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<script");
  });

  it("turns a pasted YouTube URL into an embed", () => {
    const editor = new Editor({ extensions: PRD_EXTENSIONS, content: "<p></p>" });
    try {
      // A real paste event: `view.pasteText` forces plain-text mode, which
      // skips the Markdown parse (as Shift+Cmd+V does in the browser).
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", `https://www.youtube.com/watch?v=${ID}`);
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
      );
      expect(editor.getJSON().content).toEqual([
        { type: "youtube", attrs: { videoId: ID, start: null } },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("insert command adds the node", () => {
    const editor = new Editor({ extensions: PRD_EXTENSIONS, content: "<p>Hi</p>" });
    try {
      editor.commands.setYouTubeVideo({ videoId: ID });
      expect(nodesOf(editor.getJSON())).toContain("youtube");
    } finally {
      editor.destroy();
    }
  });
});

describe("public sanitizer", () => {
  it("keeps a valid embed with only its id and start", () => {
    const doc = sanitizeDocForPublic({
      type: "doc",
      content: [{ type: "youtube", attrs: { videoId: ID, start: 7, extra: "x" } }],
    });
    expect(doc.content).toEqual([{ type: "youtube", attrs: { videoId: ID, start: 7 } }]);
  });

  it("drops an embed whose id is not a YouTube id", () => {
    const doc = sanitizeDocForPublic({
      type: "doc",
      content: [{ type: "youtube", attrs: { videoId: "javascript:alert(1)" } }],
    });
    expect(doc.content).toEqual([]);
  });
});
