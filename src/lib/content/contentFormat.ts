/**
 * Content-format module — the canonical, framework-free helpers for the app's
 * single Markdown content stack (ADR-0017).
 *
 * Markdown is the canonical stored format for authored prose. Legacy HTML
 * (produced by the old Tiptap editors) is tolerated on read and lazily
 * converted to Markdown on edit. These helpers classify a stored string so the
 * renderer can pick the right read path, and convert HTML to Markdown.
 *
 * `detectContentType` is a pure, DOM-free classifier. `htmlToMarkdown` wraps
 * `turndown`, which needs a DOM parser — available in the browser and, for
 * unit tests, under the `happy-dom` environment. No React either way.
 */

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

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

// ── htmlToMarkdown ───────────────────────────────────────────────────

/**
 * A single, lazily-built Turndown instance. Turndown holds no per-conversion
 * state, so one instance is safe to reuse across calls (and cheaper than
 * rebuilding the rule set every time).
 */
let turndownService: TurndownService | null = null;

function getTurndownService(): TurndownService {
  if (turndownService) return turndownService;

  const service = new TurndownService({
    headingStyle: "atx", // "# H1", not underlined
    bulletListMarker: "-", // matches MarkdownInput's list toolbar
    codeBlockStyle: "fenced", // ```lang fences, not indented blocks
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  // GFM adds tables, strikethrough (~~), task lists and fenced code blocks —
  // the constructs the plain CommonMark rules omit.
  service.use(gfm);

  // Turndown's default list item padding is marker + three spaces ("-   item").
  // That is valid Markdown but inconsistent with the single-space style the
  // MarkdownInput toolbar emits ("- item"). Override it for single-space
  // markers and a two-space indent for nested content (aligned to "- ").
  service.addRule("singleSpaceListItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const body = content
        .replace(/^\n+/, "") // drop leading blank lines
        .replace(/\n+$/, "\n") // collapse trailing blank lines to one
        .replace(/\n/gm, "\n  "); // indent wrapped/nested lines by two
      const parent = node.parentNode as HTMLElement | null;
      let prefix = `${options.bulletListMarker} `;
      if (parent?.nodeName === "OL") {
        const startAttr = parent.getAttribute("start");
        const start = startAttr ? Number(startAttr) : 1;
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = `${start + index}. `;
      }
      const trailing = node.nextSibling && !body.endsWith("\n") ? "\n" : "";
      return prefix + body + trailing;
    },
  });

  // <u> (underline) and <mark> (highlight) come from the legacy Tiptap editor
  // but have no Markdown equivalent. Degrade gracefully: keep the text, drop
  // the tag, rather than emitting a stray HTML node into the Markdown.
  service.addRule("stripUnrepresentableInline", {
    filter: ["u", "mark"],
    replacement: (content) => content,
  });

  turndownService = service;
  return service;
}

/**
 * Convert an HTML string (typically legacy Tiptap output) to canonical
 * Markdown. Empty/whitespace-only input yields an empty string. Tags with no
 * Markdown equivalent degrade to their text content.
 *
 * This is the "convert-on-edit" half of the content stack: a stored HTML value
 * is converted once, when a user opens it for editing, and thereafter persisted
 * as Markdown (ADR-0017). Display keeps using the HTML-tolerant renderer, so
 * un-edited legacy values still render without conversion.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  return getTurndownService().turndown(html).trim();
}
