import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Puts **plain text** on the clipboard's `text/plain` flavour.
 *
 * tiptap-markdown's `transformCopiedText` would otherwise serialise the copied
 * slice through the Markdown projection, so a plain-text target (a terminal, a
 * search box, a code editor) received the markup rather than the words — and
 * for the nodes with no Markdown spec (table rows/cells) it received raw HTML,
 * e.g. `<p><code>HOTLINE_PSEUDONYM_SECRET</code></p>` for a one-cell copy.
 *
 * `text/html` is deliberately untouched: it still carries the full ProseMirror
 * slice, so copy/paste inside the editor — and into any rich-text target —
 * keeps its formatting. Only the plain-text flavour is flattened.
 */

/**
 * Atoms hold no inline text, so `textBetween` drops them unless we supply a
 * label. Only the nodes with a human-readable one are worth emitting.
 */
function leafText(node: ProseMirrorNode): string {
  switch (node.type.name) {
    case "pageLink":
      return ((node.attrs.title as string | null) ?? "") || "Untitled";
    case "image":
      return (node.attrs.alt as string | null) ?? "";
    default:
      return "";
  }
}

export const PlainTextClipboard = Extension.create({
  name: "plainTextClipboard",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("plainTextClipboard"),
        props: {
          clipboardTextSerializer: (slice) =>
            slice.content.textBetween(0, slice.content.size, "\n\n", leafText),
        },
      }),
    ];
  },
});
