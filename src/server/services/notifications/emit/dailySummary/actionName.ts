/**
 * Action names written in the legacy rich-text editor can carry HTML — a pasted
 * link is stored as `<a href="…">label</a>`. Every renderer of the digest
 * (Markdown, plain text, speech) expects Markdown, so a link becomes
 * `[label](url)` and the other editor tags are dropped.
 *
 * Deliberately conservative:
 * - Only known editor tags count as HTML, so `Email <alice@example.com>` or
 *   `a<b and c>d` pass through untouched.
 * - Entities are decoded in ONE pass, so an escaped `&amp;lt;img&amp;gt;`
 *   becomes the text `&lt;img&gt;`, never a live tag.
 * - Only http(s) and mailto links survive; anything else keeps just its label.
 * - Labels and URLs are made safe for the `[label](url)` pattern every
 *   renderer matches (brackets in a label become parentheses; parentheses and
 *   whitespace in a URL are percent-encoded).
 * - Very long names skip normalisation, bounding the regex work.
 */

const MAX_NORMALISED_LENGTH = 2000;

// A known tag name, then only `name="value"` attributes (the editor always
// quotes them) — so prose like `a<b and c>d` is not mistaken for a tag.
const EDITOR_TAG =
  /<\/?(?:a|p|br|span|div|strong|b|em|i|u|s|mark|code|ul|ol|li|h[1-6])(?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>/gi;

const LINK =
  /<a\b[^<>]*?\bhref\s*=\s*(["'])(.*?)\1[^<>]*>([\s\S]*?)<\/a>/gi;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntitiesOnce(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (e) => ENTITIES[e] ?? e);
}

/** Tags out, entities decoded once, whitespace collapsed. */
function toText(html: string): string {
  return decodeEntitiesOnce(html.replace(EDITOR_TAG, "")).replace(/\s+/g, " ").trim();
}

function safeUrl(href: string): string | null {
  const url = decodeEntitiesOnce(href).trim();
  if (!/^(https?:|mailto:)/i.test(url)) return null;
  return url.replace(/[()\s]/g, (c) =>
    c === "(" ? "%28" : c === ")" ? "%29" : "%20",
  );
}

export function actionNameMarkdown(name: string): string {
  if (name.length > MAX_NORMALISED_LENGTH) return name;
  EDITOR_TAG.lastIndex = 0;
  if (!EDITOR_TAG.test(name)) return name;

  // Split around links so each text segment is converted exactly once.
  const parts: string[] = [];
  let last = 0;
  for (const match of name.matchAll(LINK)) {
    const [whole, , href = "", labelHtml = ""] = match;
    const index = match.index ?? 0;
    parts.push(toText(name.slice(last, index)));
    const url = safeUrl(href);
    const label = toText(labelHtml).replace(/\[/g, "(").replace(/\]/g, ")");
    parts.push(url ? `[${label || url}](${url})` : label);
    last = index + whole.length;
  }
  parts.push(toText(name.slice(last)));
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
