/**
 * One-line plain text from stored prose, for labels that cannot carry markup.
 *
 * The canonical display path for authored content is `MarkdownRenderer` (or
 * `HTMLContent` for legacy action names) — see ADR-0017 and
 * dev-docs/CONTENT_RENDERING.md. Some surfaces cannot use it: a list row that
 * is itself an anchor cannot contain the `<a>`s a rendered link produces
 * (nested anchors are invalid HTML and split the row link), and a
 * single-line, ellipsis-truncated label cannot hold the block elements
 * Markdown renders to. Those surfaces show the text a reader would see
 * instead — and until they did, the workspace home rows printed raw
 * `<a target="_blank" …>` markup.
 *
 * Either stored format is accepted: Markdown (canonical), plain text, or the
 * legacy Tiptap HTML that is tolerated on read. HTML is reduced to its text;
 * Markdown has its syntax removed (`**bold**` → `bold`, `[text](url)` →
 * `text`, list and heading markers dropped). The result is collapsed onto one
 * line, so a multi-paragraph description becomes a space-separated excerpt.
 */

import { detectContentType } from "./contentFormat";

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decode the entities the legacy editors and Markdown escapes produce. */
function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number(decimal));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      const named = name ? NAMED_ENTITIES[name.toLowerCase()] : undefined;
      return named ?? match;
    },
  );
}

/**
 * Legacy HTML → text. Block boundaries and line breaks become spaces so
 * `<p>a</p><p>b</p>` reads "a b"; inline tags vanish so `un<em>do</em>`
 * stays one word.
 */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr|blockquote|pre)>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  );
}

/** Punctuation Markdown lets you backslash-escape (CommonMark §2.4). */
const ESCAPABLE = "\\`*_{}[]()#+-.!>~|";
const SENTINEL_BASE = 0xe000; // private-use plane: never in real content

/** Markdown → text: every construct reduced to what it wraps. */
function markdownToText(markdown: string): string {
  return decodeEntities(
    markdown
      // Escaped punctuation is literal: park it out of the way of the syntax
      // rules below (`\\*not\\*` is not emphasis) and restore it at the end.
      .replace(
        /\\([\\`*_{}[\]()#+\-.!>~|])/g,
        (_, ch: string) =>
          String.fromCharCode(SENTINEL_BASE + ESCAPABLE.indexOf(ch)),
      )
      // Fence markers are markup; the lines between them are content.
      .replace(/^\s*```[^\n]*$/gm, "")
      // Mentions keep their "@" (the plain link rule below would drop it).
      .replace(/@\[([^\]\n]+)\]\([^()\s]+\)/g, "@$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → link text
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1") // reference-style links
      .replace(/<(https?:\/\/[^>\s]+)>/g, "$1") // autolinks
      .replace(/`([^`\n]*)`/g, "$1") // inline code
      .replace(/^\s{0,3}#{1,6}\s+/gm, "") // ATX headings
      .replace(/^\s*>\s?/gm, "") // blockquotes
      .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm, "") // horizontal rules
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, "") // list markers
      .replace(/\*\*(.+?)\*\*/gs, "$1")
      .replace(/__(.+?)__/gs, "$1")
      .replace(/~~(.+?)~~/gs, "$1")
      // Single-delimiter emphasis only at word edges, so snake_case names and
      // arithmetic ("2 * 3") survive untouched.
      .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/gs, "$1")
      .replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/gs, "$1")
      .replace(/[\uE000-\uE0FF]/g, (ch) =>
        ESCAPABLE.charAt(ch.charCodeAt(0) - SENTINEL_BASE),
      ),
  );
}

/**
 * Reduce a stored content string (Markdown, plain text, or legacy HTML) to
 * one line of plain text. Empty and nullish input yield an empty string.
 */
export function toPlainText(content: string | null | undefined): string {
  if (!content) return "";
  const text =
    detectContentType(content) === "html"
      ? htmlToText(content)
      : markdownToText(content);
  return text.replace(/\s+/g, " ").trim();
}
