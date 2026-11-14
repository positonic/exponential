import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";

/**
 * The two inline marks Markdown has no syntax for.
 *
 * Strike is native (`~~`, StarterKit's own extension), but underline and
 * highlight only exist as HTML. tiptap-markdown would fall back to emitting
 * `<u>`/`<mark>` through its generic HTML-mark handler, but only while its
 * `html: true` option stays on. Declaring the serializers here makes the
 * projection a decision rather than a side effect, and gives the codec tests
 * an exact string to pin. Parsing back needs no work: markdown-it hands the
 * raw HTML to Tiptap, whose own `parseHTML` claims `<u>` and `<mark>`.
 *
 * Off-editor readers see these tags in the stored Markdown, so
 * `detectContentType` must not take them as evidence of legacy HTML (see
 * `~/lib/content/contentFormat`).
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

/**
 * Highlight, projected as `<mark>…</mark>`. Only the default colour is
 * offered (`multicolor` stays off), so the tag carries no attributes and the
 * round-trip is exact.
 */
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
