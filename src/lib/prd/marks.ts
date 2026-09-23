import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";

/**
 * The two inline marks Markdown has no syntax for.
 *
 * Strike is native (`~~`), but underline and highlight only exist as HTML.
 * tiptap-markdown would fall back to emitting `<u>`/`<mark>` through its
 * generic HTML-mark handler, which works but is implicit: it depends on the
 * `html: true` option staying on and on the tag list it derives from the
 * schema. Declaring the serializers here makes the projection a decision
 * rather than a side effect, and gives the codec tests an exact string to
 * pin. Parsing back needs no work — markdown-it hands the raw HTML to Tiptap,
 * whose own `parseHTML` claims `<u>` and `<mark>`.
 */

/** Underline, projected as `<u>…</u>`. */
export const MarkdownUnderline = Underline.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "<u>", close: "</u>", expelEnclosingWhitespace: true },
        parse: {},
      },
    };
  },
});

/** Highlight, projected as `<mark>…</mark>`. Colours are not offered, so the
 * tag carries no attributes and survives the round-trip unchanged. */
export const MarkdownHighlight = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: "<mark>",
          close: "</mark>",
          expelEnclosingWhitespace: true,
        },
        parse: {},
      },
    };
  },
});
