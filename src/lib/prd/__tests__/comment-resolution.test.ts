import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";

import { buildPrdExtensions } from "../extensions";
import { CommentResolution, setResolvedThreadIds } from "../comment-resolution";

/**
 * The resolved-highlight CSS hides every `.prd-comment-highlight` span that
 * contains a `.prd-comment-resolved` decoration. That is only correct if the
 * decoration never lands inside the span of a thread that is still open —
 * which these tests pin, including overlapping threads on the same text.
 */

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
});

function text(value: string, threadIds: string[]): JSONContent {
  return {
    type: "text",
    text: value,
    marks: threadIds.map((threadId) => ({ type: "comment", attrs: { threadId } })),
  };
}

function mount(content: JSONContent[], resolved: string[]): HTMLElement {
  const editor = new Editor({
    extensions: [...buildPrdExtensions(), CommentResolution],
    content: { type: "doc", content: [{ type: "paragraph", content }] },
  });
  editors.push(editor);
  setResolvedThreadIds(editor, new Set(resolved));
  return editor.view.dom;
}

/** Thread ids whose highlight span the CSS would hide. */
function hiddenThreads(dom: HTMLElement): string[] {
  return Array.from(dom.querySelectorAll<HTMLElement>("[data-comment-thread]"))
    .filter((span) => span.querySelector(".prd-comment-resolved") !== null)
    .map((span) => span.getAttribute("data-comment-thread")!)
    .sort();
}

describe("CommentResolution", () => {
  it("hides a lone resolved thread", () => {
    const dom = mount([text("indicator", ["a"])], ["a"]);
    expect(hiddenThreads(dom)).toEqual(["a"]);
  });

  it("leaves an open thread highlighted", () => {
    const dom = mount([text("indicator", ["a"])], []);
    expect(hiddenThreads(dom)).toEqual([]);
  });

  it("never hides an open thread that overlaps a resolved one", () => {
    // Both orders of the same pair: whichever mark renders innermost, the
    // open thread's span must not end up containing the resolved decoration.
    expect(hiddenThreads(mount([text("same words", ["a", "b"])], ["a"]))).toEqual([]);
    expect(hiddenThreads(mount([text("same words", ["a", "b"])], ["b"]))).toEqual([]);
  });

  it("hides overlapping threads once all of them are resolved", () => {
    const dom = mount([text("same words", ["a", "b"])], ["a", "b"]);
    expect(hiddenThreads(dom)).toEqual(["a", "b"]);
  });

  it("hides only the resolved thread when an open one covers part of it", () => {
    // Thread a (resolved) spans "hello world"; thread b (open) covers "world".
    const dom = mount([text("hello ", ["a"]), text("world", ["a", "b"])], ["a"]);
    expect(hiddenThreads(dom)).toEqual(["a"]);
  });
});
