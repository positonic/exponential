import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { PRD_EXTENSIONS } from "../extensions";
import { selectionToMarkdown } from "../selection-markdown";

/** Markdown for a selection spanning `from`..`to`; whole doc when omitted. */
function select(
  content: JSONContent,
  range?: { from: number; to: number },
): string | null {
  const editor = new Editor({ extensions: PRD_EXTENSIONS, content });
  try {
    const { doc } = editor.state;
    const from = range?.from ?? 0;
    const to = range?.to ?? doc.content.size;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.between(doc.resolve(from), doc.resolve(to)),
      ),
    );
    return selectionToMarkdown(editor);
  } finally {
    editor.destroy();
  }
}

const para = (text: string, marks?: { type: string }[]): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", ...(marks ? { marks } : {}), text }],
});

describe("selectionToMarkdown", () => {
  it("keeps inline marks as Markdown", () => {
    expect(
      select({
        type: "doc",
        content: [para("HOTLINE_PSEUDONYM_SECRET", [{ type: "code" }])],
      }),
    ).toBe("`HOTLINE_PSEUDONYM_SECRET`");
  });

  it("keeps block syntax across a multi-block selection", () => {
    const markdown = select({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Secrets" }],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [para("one")] },
            { type: "listItem", content: [para("two")] },
          ],
        },
      ],
    });
    expect(markdown).toBe("## Secrets\n\n- one\n- two");
  });

  it("serialises only the selected part of a paragraph", () => {
    // Positions inside a single leading paragraph: "Hello there".
    expect(select({ type: "doc", content: [para("Hello there")] }, { from: 1, to: 6 })).toBe(
      "Hello",
    );
  });

  it("returns null for an empty selection", () => {
    expect(select({ type: "doc", content: [para("Hello")] }, { from: 3, to: 3 })).toBeNull();
  });

  it("returns null when the selection holds no text", () => {
    expect(
      select({ type: "doc", content: [{ type: "paragraph" }] }),
    ).toBeNull();
  });

  it("drops comment marks, as the projection does", () => {
    expect(
      select({
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

  it("projects a page-link block as a Markdown link", () => {
    expect(
      select({
        type: "doc",
        content: [
          {
            type: "pageLink",
            attrs: { pageId: "p1", title: "Runbook", href: "/w/acme/pages/p1" },
          },
        ],
      }),
    ).toBe("[Runbook](/w/acme/pages/p1)");
  });

  it("returns null without an editor", () => {
    expect(selectionToMarkdown(null)).toBeNull();
  });
});
