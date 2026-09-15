/**
 * The bubble menu's block-type resolution and its apply commands, driven
 * against the real editor schema rather than a stub.
 *
 * The bug this exists for: `isActive("paragraph")` is true for a paragraph
 * *inside* a blockquote, so reading the menu's display order labelled a quote
 * "Text" — and the Quote row, being a toggle, then deleted the quote the label
 * said wasn't there. Both halves are pinned here: what the menu says, and that
 * choosing the current row changes nothing.
 */

import { describe, expect, it, afterEach } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { PRD_EXTENSIONS } from "~/lib/prd/extensions";
import { BLOCK_TYPES, resolveBlockType } from "../BlockTypeMenu";

let editor: Editor | null = null;

/** An editor over a doc containing `node`, caret at the start. */
function openAt(node: JSONContent): Editor {
  editor = new Editor({
    extensions: PRD_EXTENSIONS,
    content: { type: "doc", content: [node] },
  });
  editor.commands.focus("start");
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const para = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const apply = (e: Editor, label: string) =>
  BLOCK_TYPES.find((b) => b.label === label)!.apply(e);

describe("resolveBlockType", () => {
  it("calls a plain paragraph Text", () => {
    expect(resolveBlockType(openAt(para("hello")))).toBe("Text");
  });

  it("calls a paragraph inside a blockquote Quote, not Text", () => {
    const e = openAt({ type: "blockquote", content: [para("quoted")] });
    // Both are active; the wrapper is the answer a reader wants.
    expect(e.isActive("paragraph")).toBe(true);
    expect(resolveBlockType(e)).toBe("Quote");
  });

  it("names each heading level", () => {
    for (const level of [1, 2, 3] as const) {
      const e = openAt({
        type: "heading",
        attrs: { level },
        content: [{ type: "text", text: "h" }],
      });
      expect(resolveBlockType(e)).toBe(`Heading ${level}`);
      e.destroy();
    }
  });

  it("calls a code block Code block", () => {
    const e = openAt({
      type: "codeBlock",
      content: [{ type: "text", text: "const x = 1" }],
    });
    expect(resolveBlockType(e)).toBe("Code block");
  });
});

describe("the commands themselves are not all idempotent", () => {
  it("setBlockquote over a selection inside a quote nests a second one", () => {
    // Why the menu short-circuits the current row rather than trusting the
    // command: this is the bubble menu's normal state, since it only appears
    // when text is selected.
    const e = openAt({ type: "blockquote", content: [para("quoted")] });
    e.commands.selectAll();
    apply(e, "Quote");
    expect(e.getJSON().content?.[0]?.content?.[0]?.type).toBe("blockquote");
  });
});

describe("choosing the current block type is a no-op", () => {
  it("Quote on a quote leaves the quote alone", () => {
    const e = openAt({ type: "blockquote", content: [para("quoted")] });
    e.commands.selectAll();
    // What the menu does: the row is current, so no command runs at all.
    expect(resolveBlockType(e)).toBe("Quote");
    expect(e.getJSON().content?.[0]?.content?.[0]?.type).toBe("paragraph");
  });

  it("Code block on a code block leaves the code alone", () => {
    const e = openAt({
      type: "codeBlock",
      content: [{ type: "text", text: "const x = 1" }],
    });
    apply(e, "Code block");
    expect(e.getJSON().content?.[0]?.type).toBe("codeBlock");
  });

  it("Heading 2 on a Heading 2 leaves the heading alone", () => {
    const e = openAt({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "h" }],
    });
    apply(e, "Heading 2");
    const node = e.getJSON().content?.[0];
    expect(node?.type).toBe("heading");
    expect(node?.attrs?.level).toBe(2);
  });
});

describe("changing the block type", () => {
  it("Text lifts a paragraph out of its blockquote", () => {
    const e = openAt({ type: "blockquote", content: [para("quoted")] });
    apply(e, "Text");
    expect(e.getJSON().content?.[0]?.type).toBe("paragraph");
    expect(resolveBlockType(e)).toBe("Text");
  });

  it("Quote wraps a paragraph, and Text takes it back out", () => {
    const e = openAt(para("hello"));
    apply(e, "Quote");
    expect(resolveBlockType(e)).toBe("Quote");
    apply(e, "Text");
    expect(resolveBlockType(e)).toBe("Text");
  });

  it("Text turns a code block back into a paragraph", () => {
    const e = openAt({
      type: "codeBlock",
      content: [{ type: "text", text: "const x = 1" }],
    });
    apply(e, "Text");
    expect(e.getJSON().content?.[0]?.type).toBe("paragraph");
  });

  it("does not split a multi-paragraph quote when Quote is chosen again", () => {
    const e = openAt({
      type: "blockquote",
      content: [para("first"), para("second")],
    });
    e.commands.focus("end");
    apply(e, "Quote");
    const top = e.getJSON().content ?? [];
    expect(top).toHaveLength(1);
    expect(top[0]?.type).toBe("blockquote");
    expect(top[0]?.content).toHaveLength(2);
  });
});
