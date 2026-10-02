import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { PRD_EXTENSIONS } from "../extensions";

/** Copy the whole document the way ProseMirror does, and return `text/plain`. */
function copyAll(content: JSONContent): string {
  const editor = new Editor({ extensions: PRD_EXTENSIONS, content });
  try {
    const { doc } = editor.state;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.between(doc.resolve(0), doc.resolve(doc.content.size)),
      ),
    );
    const slice = editor.state.selection.content();
    // Exactly how prosemirror-view resolves it: the first plugin whose
    // serializer returns something truthy wins.
    const text = editor.view.someProp(
      "clipboardTextSerializer",
      (f) => (f as (slice: Slice) => string | null)(slice),
    ) as string | undefined;
    return text ?? slice.content.textBetween(0, slice.content.size, "\n\n");
  } finally {
    editor.destroy();
  }
}

const para = (text: string, marks?: { type: string }[]): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", ...(marks ? { marks } : {}), text }],
});

describe("plain-text clipboard", () => {
  it("drops inline Markdown markers", () => {
    expect(
      copyAll({
        type: "doc",
        content: [
          para("HOTLINE_PSEUDONYM_SECRET", [{ type: "code" }]),
          para("shouty", [{ type: "bold" }]),
        ],
      }),
    ).toBe("HOTLINE_PSEUDONYM_SECRET\n\nshouty");
  });

  it("drops block Markdown syntax", () => {
    const text = copyAll({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Secrets" }] },
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [para("one")] }],
        },
      ],
    });
    expect(text).not.toMatch(/[#*`]/);
    expect(text).toContain("Secrets");
    expect(text).toContain("one");
  });

  // The reported bug: table cells have no Markdown spec, so tiptap-markdown
  // fell back to raw HTML for them.
  it("never emits HTML for a table", () => {
    const text = copyAll({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [para("HOTLINE_PSEUDONYM_SECRET", [{ type: "code" }])],
                },
                { type: "tableCell", content: [para("the pepper")] },
              ],
            },
          ],
        },
      ],
    });
    expect(text).not.toContain("<");
    expect(text).toContain("HOTLINE_PSEUDONYM_SECRET");
    expect(text).toContain("the pepper");
  });

  it("keeps the label of a page-link block", () => {
    expect(
      copyAll({
        type: "doc",
        content: [
          {
            type: "pageLink",
            attrs: { pageId: "p1", title: "Runbook", href: "/w/acme/pages/p1" },
          },
        ],
      }),
    ).toBe("Runbook");
  });

  it("leaves comment-marked text unwrapped", () => {
    expect(
      copyAll({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                marks: [{ type: "comment", attrs: { threadId: "t1" } }],
                text: "needs review",
              },
            ],
          },
        ],
      }),
    ).toBe("needs review");
  });
});
