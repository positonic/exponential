import { afterEach, describe, it, expect } from "vitest";
import { Editor, type Extensions } from "@tiptap/core";

import { PRD_EXTENSIONS } from "../extensions";
import { DomSelectionSync, syncSelectionFromDom } from "../dom-selection-sync";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) {
    const editor = editors.pop();
    editor?.view.dom.parentElement?.remove();
    editor?.destroy();
  }
});

function makeEditor(extensions: Extensions) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions,
    content: "<p>alpha beta gamma</p>",
  });
  editors.push(editor);
  editor.view.dom.focus();
  return editor;
}

/** The paragraph's text node, where the browser would put its caret. */
function textNode(editor: Editor): Text {
  const node = editor.view.dom.querySelector("p")?.firstChild;
  if (!(node instanceof Text)) throw new Error("no text node");
  return node;
}

/**
 * Move the DOM selection without ProseMirror hearing about it. happy-dom fires
 * `selectionchange` synchronously, where a browser queues it; swallowing it
 * reproduces the window in which a key arrives before the event does.
 */
function moveDomSelectionSilently(move: () => void) {
  const swallow = (e: Event) => e.stopImmediatePropagation();
  window.addEventListener("selectionchange", swallow, true);
  try {
    move();
  } finally {
    window.removeEventListener("selectionchange", swallow, true);
  }
}

/**
 * The state of the bug: ProseMirror still holds "beta" as selected, but the
 * browser has already collapsed its selection to just after "beta" (what
 * ArrowRight does) and the `selectionchange` event has not arrived yet.
 */
function selectBetaThenCollapseDomOnly(editor: Editor) {
  // "alpha " is 6 chars and the paragraph opens at 1, so "beta" is 7..11.
  editor.commands.setTextSelection({ from: 7, to: 11 });
  expect(editor.state.doc.textBetween(7, 11)).toBe("beta");
  moveDomSelectionSilently(() => document.getSelection()?.collapse(textNode(editor), 10));
  expect(editor.state.selection.to - editor.state.selection.from).toBe(4);
}

function pressEnter(editor: Editor) {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true }),
  );
}

describe("DomSelectionSync", () => {
  it("Enter splits at the caret the browser shows, not over a stale selection", () => {
    const editor = makeEditor([...PRD_EXTENSIONS, DomSelectionSync]);
    selectBetaThenCollapseDomOnly(editor);

    pressEnter(editor);

    expect(editor.getText({ blockSeparator: "|" })).toBe("alpha beta| gamma");
  });

  it("without it, the same Enter replaces the word (the bug this guards)", () => {
    const editor = makeEditor([...PRD_EXTENSIONS]);
    selectBetaThenCollapseDomOnly(editor);

    pressEnter(editor);

    expect(editor.getText({ blockSeparator: "|" })).toBe("alpha | gamma");
  });

  it("adopts a DOM selection that differs, and leaves a matching one alone", () => {
    const editor = makeEditor([...PRD_EXTENSIONS, DomSelectionSync]);
    selectBetaThenCollapseDomOnly(editor);

    expect(syncSelectionFromDom(editor.view)).toBe(true);
    expect(editor.state.selection.from).toBe(11);
    expect(editor.state.selection.empty).toBe(true);

    expect(syncSelectionFromDom(editor.view)).toBe(false);
  });

  it("does nothing when the DOM selection is outside the editor", () => {
    const editor = makeEditor([...PRD_EXTENSIONS, DomSelectionSync]);
    editor.commands.setTextSelection({ from: 7, to: 11 });
    const outside = document.createElement("p");
    outside.textContent = "elsewhere";
    document.body.appendChild(outside);
    moveDomSelectionSilently(() => document.getSelection()?.collapse(outside.firstChild, 3));

    expect(syncSelectionFromDom(editor.view)).toBe(false);
    expect(editor.state.selection.from).toBe(7);
    expect(editor.state.selection.to).toBe(11);
    outside.remove();
  });
});
