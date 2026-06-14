/**
 * Content-format module — the canonical, framework-free helpers for the app's
 * single Markdown content stack (ADR-0016).
 *
 * Markdown is the canonical stored format for authored prose. Legacy HTML
 * (produced by the old Tiptap editors) is tolerated on read and lazily
 * converted to Markdown on edit. These helpers classify a stored string so the
 * renderer can pick the right read path, and (later) convert HTML to Markdown.
 *
 * Pure functions only — no React, no DOM. This keeps the module trivially
 * unit-testable. The `htmlToMarkdown` converter is added by the convert-on-edit
 * slice (it pulls in `turndown`); detection lives here from the start because
 * the HTML-tolerant renderer needs it.
 */

export type ContentType = "html" | "markdown" | "text";

/** Matches a recognisable block/inline HTML tag produced by the legacy editors. */
const HTML_TAG_PATTERN =
  /<(?:p|div|span|br|a|strong|em|b|i|u|s|ul|ol|li|h[1-6]|table|thead|tbody|tr|th|td|img|blockquote|pre|code|hr|mark)\b[^>]*>/i;

/** Common Markdown constructs. Any one is enough to treat the string as Markdown. */
const MARKDOWN_PATTERNS: RegExp[] = [
  /^#{1,6}\s/m, // ATX headings
  /\*\*[^*]+\*\*/, // bold
  /(?<!\*)\*[^*\s][^*]*\*(?!\*)/, // italic (not bold)
  /\[[^\]]+\]\([^)]+\)/, // links / images
  /^\s*[-*+]\s/m, // unordered list
  /^\s*\d+\.\s/m, // ordered list
  /```[\s\S]*?```/, // fenced code block
  /`[^`]+`/, // inline code
  /^\s*>\s/m, // blockquote
  /^\s*\|.+\|\s*$/m, // table row
];

/**
 * Classify a stored content string as HTML, Markdown, or plain text.
 *
 * HTML is checked first: a real HTML tag is a strong signal the value came from
 * the legacy editors. Otherwise we look for Markdown constructs; failing that,
 * the value is plain text (which renders fine through the Markdown path too).
 */
export function detectContentType(content: string): ContentType {
  if (!content) return "text";
  if (HTML_TAG_PATTERN.test(content)) return "html";
  if (MARKDOWN_PATTERNS.some((pattern) => pattern.test(content))) {
    return "markdown";
  }
  return "text";
}
