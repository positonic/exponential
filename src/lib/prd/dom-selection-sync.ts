import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Reads the browser's selection into the editor state before any key is
 * handled.
 *
 * ProseMirror leaves caret movement (arrow keys, Home/End, Shift+arrow) to the
 * browser, and only learns the result when the asynchronous `selectionchange`
 * event arrives. Its keydown handler does not re-read the DOM selection (as of
 * prosemirror-view 1.40 and still upstream), so a key that lands before that
 * event acts on the previous selection. The visible bug: select a word, press
 * ArrowRight (the browser collapses the selection), press Enter, and Enter
 * replaces the word, because ProseMirror still holds it as selected. How often
 * the window is hit depends on how busy the main thread is, which is why a
 * heavy host page (the Feature page) shows it more than a light one.
 *
 * This plugin closes the window: on every keydown it maps the DOM selection to
 * document positions and, when they differ from the state's text selection,
 * adopts them first. Every other keydown handler (keymaps, the slash menu)
 * then sees the selection the person can see.
 */
export const domSelectionSyncKey = new PluginKey("domSelectionSync");

/**
 * Adopt the DOM selection into `view.state` when the two disagree. Returns
 * true when it dispatched. Only plain text selections are touched: node, cell
 * and gap-cursor selections are ProseMirror's own and never come from a
 * browser caret move.
 */
export function syncSelectionFromDom(view: EditorView): boolean {
  if (view.composing || !view.hasFocus()) return false;
  const current = view.state.selection;
  if (!(current instanceof TextSelection)) return false;

  const domSel = view.dom.ownerDocument.getSelection();
  const { anchorNode, focusNode } = domSel ?? {};
  if (!domSel || !anchorNode || !focusNode) return false;
  if (!view.dom.contains(anchorNode) || !view.dom.contains(focusNode)) return false;

  let anchor: number;
  let head: number;
  try {
    anchor = view.posAtDOM(anchorNode, domSel.anchorOffset);
    head = view.posAtDOM(focusNode, domSel.focusOffset);
  } catch {
    return false;
  }
  if (anchor === current.anchor && head === current.head) return false;

  const { doc } = view.state;
  if (anchor < 0 || head < 0 || anchor > doc.content.size || head > doc.content.size) {
    return false;
  }
  // A caret inside an atom or a node view without editable content maps to a
  // block boundary, which is not a text position; leave those to ProseMirror.
  if (!doc.resolve(anchor).parent.inlineContent || !doc.resolve(head).parent.inlineContent) {
    return false;
  }

  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, anchor, head)));
  return true;
}

export const DomSelectionSync = Extension.create({
  name: "domSelectionSync",
  // Ahead of every keymap, so Enter/Backspace/typing all see the synced
  // selection. Tiptap runs higher-priority extensions' plugins first.
  priority: 10_000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: domSelectionSyncKey,
        props: {
          handleKeyDown(view, event) {
            // 229 is an IME composition keystroke: the DOM is mid-edit there.
            if (event.isComposing || event.keyCode === 229) return false;
            syncSelectionFromDom(view);
            // Never consume the key; this only corrects the state first.
            return false;
          },
        },
      }),
    ];
  },
});
