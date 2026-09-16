import { afterEach, describe, it, expect } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";

import { PRD_EXTENSIONS } from "../extensions";
import { collectAnchoredThreadIds } from "../thread-reconciliation";
import {
  PendingCommentHighlight,
  anchorPendingComment,
  clearPendingComment,
  getPendingComment,
  pendingThreadIdAt,
  setPendingComment,
  threadMarkText,
} from "../pending-comment";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function makeEditor(content: string | JSONContent = "<p>Hello brave new world</p>") {
  const editor = new Editor({
    extensions: [...PRD_EXTENSIONS, PendingCommentHighlight],
    content,
  });
  editors.push(editor);
  return editor;
}

/** Doc position range of `word` in the editor's text. */
function rangeOf(editor: Editor, word: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return undefined;
    const i = node.text.indexOf(word);
    if (i >= 0) found = { from: pos + i, to: pos + i + word.length };
    return undefined;
  });
  if (!found) throw new Error(`"${word}" not in doc`);
  return found;
}

const pendingDecorations = (editor: Editor) =>
  editor.view.dom.querySelectorAll("[data-comment-pending]");

describe("pending comment highlight", () => {
  it("highlights the selection without putting a comment mark in the document", () => {
    const editor = makeEditor();
    const before = editor.getJSON();

    setPendingComment(editor, { threadId: "t1", ...rangeOf(editor, "brave") });

    // The saved doc is untouched — a reload can't resurrect the highlight.
    expect(editor.getJSON()).toEqual(before);
    expect(collectAnchoredThreadIds(editor.getJSON()).size).toBe(0);
    // …but it is visible.
    const decos = pendingDecorations(editor);
    expect(decos).toHaveLength(1);
    expect(decos[0]?.textContent).toBe("brave");
  });

  it("stays glued to its words as the document is edited", () => {
    const editor = makeEditor();
    setPendingComment(editor, { threadId: "t1", ...rangeOf(editor, "new") });

    editor.commands.insertContentAt(1, "Oh, ");

    const pending = getPendingComment(editor.state);
    expect(pending).not.toBeNull();
    expect(editor.state.doc.textBetween(pending!.from, pending!.to)).toBe("new");
  });

  it("doesn't grow when typing right at its edges", () => {
    const editor = makeEditor();
    const { from, to } = rangeOf(editor, "new");
    setPendingComment(editor, { threadId: "t1", from, to });

    editor.commands.insertContentAt(to, "X");
    editor.commands.insertContentAt(from, "Y");

    const pending = getPendingComment(editor.state)!;
    expect(editor.state.doc.textBetween(pending.from, pending.to)).toBe("new");
  });

  it("is dropped by clearPendingComment", () => {
    const editor = makeEditor();
    setPendingComment(editor, { threadId: "t1", ...rangeOf(editor, "brave") });

    clearPendingComment(editor);

    expect(getPendingComment(editor.state)).toBeNull();
    expect(pendingDecorations(editor)).toHaveLength(0);
  });

  it("reports the pending thread under a position, inclusive of its edges", () => {
    const editor = makeEditor();
    const { from, to } = rangeOf(editor, "brave");
    setPendingComment(editor, { threadId: "t1", from, to });

    expect(pendingThreadIdAt(editor.state, from)).toBe("t1");
    expect(pendingThreadIdAt(editor.state, to)).toBe("t1");
    expect(pendingThreadIdAt(editor.state, from - 2)).toBeNull();
  });
});

describe("anchorPendingComment", () => {
  it("applies the comment mark over the pending range", () => {
    const editor = makeEditor();
    setPendingComment(editor, { threadId: "t1", ...rangeOf(editor, "brave") });

    expect(anchorPendingComment(editor, "t1")).toBe(true);

    expect([...collectAnchoredThreadIds(editor.getJSON())]).toEqual(["t1"]);
    expect(threadMarkText(editor.state.doc, "t1")).toBe("brave");
    // The decoration survives until cleared, so a failed post can roll back.
    expect(getPendingComment(editor.state)?.threadId).toBe("t1");
  });

  it("marks the words where they are now, not where they were selected", () => {
    const editor = makeEditor();
    setPendingComment(editor, { threadId: "t1", ...rangeOf(editor, "world") });
    editor.commands.insertContentAt(1, "Well — ");

    anchorPendingComment(editor, "t1");

    expect(threadMarkText(editor.state.doc, "t1")).toBe("world");
  });

  it("does nothing for a different thread", () => {
    const editor = makeEditor();
    setPendingComment(editor, { threadId: "t1", ...rangeOf(editor, "brave") });
    const before = editor.getJSON();

    expect(anchorPendingComment(editor, "t2")).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("does nothing when the pending text was deleted while composing", () => {
    const editor = makeEditor();
    const { from, to } = rangeOf(editor, "brave ");
    setPendingComment(editor, { threadId: "t1", from, to });
    editor.commands.deleteRange({ from, to });
    const before = editor.getJSON();

    expect(anchorPendingComment(editor, "t1")).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(pendingDecorations(editor)).toHaveLength(0);
  });
});

describe("threadMarkText", () => {
  it("returns an empty string for a thread with no mark", () => {
    const editor = makeEditor();
    expect(threadMarkText(editor.state.doc, "nope")).toBe("");
  });

  it("keeps a span continuous across other marks and joins separate spans", () => {
    const comment = (threadId: string) => ({ type: "comment", attrs: { threadId } });
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "plain " },
            { type: "text", text: "half ", marks: [comment("t1")] },
            { type: "text", text: "bold", marks: [comment("t1"), { type: "bold" }] },
            { type: "text", text: " gap " },
            { type: "text", text: "other", marks: [comment("t2")] },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "second", marks: [comment("t1")] }],
        },
      ],
    });

    expect(threadMarkText(editor.state.doc, "t1")).toBe("half bold second");
    expect(threadMarkText(editor.state.doc, "t2")).toBe("other");
  });

  it("caps the snapshot like a fresh selection", () => {
    const long = "x".repeat(1500);
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: long, marks: [{ type: "comment", attrs: { threadId: "t1" } }] },
          ],
        },
      ],
    });
    expect(threadMarkText(editor.state.doc, "t1")).toHaveLength(1000);
  });
});
