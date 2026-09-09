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

const MAX_CODE_POINT = 0x10ffff;

/**
 * Decode the entities the legacy editors and Markdown escapes produce. A
 * numeric entity outside the Unicode range (`&#1114112;`) is left as typed:
 * `String.fromCodePoint` would throw, and this runs during render.
 */
function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (decimal !== undefined || hex !== undefined) {
        const codePoint =
          decimal !== undefined ? Number(decimal) : parseInt(hex!, 16);
        // A lone surrogate would make a malformed string, not a character.
        const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
        return codePoint <= MAX_CODE_POINT && !isSurrogate
          ? String.fromCodePoint(codePoint)
          : match;
      }
      const named = name ? NAMED_ENTITIES[name.toLowerCase()] : undefined;
      return named ?? match;
    },
  );
}

/**
 * Legacy HTML → text. Block boundaries and line breaks become spaces so
 * `<p>a</p><p>b</p>` reads "a b" (Tiptap's `<br class="ProseMirror-…">`
 * included); inline tags vanish so `un<em>do</em>` stays one word. Script
 * and style bodies are source, not prose, and go with their tags.
 */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\b[^>]*>|<\/(?:p|div|li|h[1-6]|tr|blockquote|pre)>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  );
}

/**
 * The characters Markdown lets you backslash-escape: every ASCII punctuation
 * character (CommonMark §2.4), so `\\$5` reads "$5" here as it does in
 * MarkdownRenderer.
 */
const ESCAPABLE = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
/**
 * One sentinel per escapable character, drawn from the Unicode noncharacters
 * U+FDD0–U+FDEF: code points reserved for exactly this kind of
 * process-internal use, which never occur in interchanged text (unlike the
 * private-use area, which some fonts and pasted content do use). There are
 * 32 of them, one for each ASCII punctuation character; the restore pattern
 * covers only the sentinels assigned.
 */
const SENTINEL_BASE = 0xfdd0;
const SENTINEL_PATTERN = new RegExp(
  `[${String.fromCharCode(SENTINEL_BASE)}-${String.fromCharCode(SENTINEL_BASE + ESCAPABLE.length - 1)}]`,
  "g",
);

/** Markdown → text: every construct reduced to what it wraps. */
function markdownToText(markdown: string): string {
  return decodeEntities(
    markdown
      // Escaped punctuation is literal: park it out of the way of the syntax
      // rules below (`\\*not\\*` is not emphasis) and restore it at the end.
      .replace(
        /\\([!-/:-@[-`{-~])/g,
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
      .replace(SENTINEL_PATTERN, (ch) =>
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
