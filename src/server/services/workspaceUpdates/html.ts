import "server-only";

import { renderPublicPageHtml } from "~/server/services/pages/public-html";
import { markdownToDocServer } from "~/server/services/prd/markdown-doc";
import { colorTokens } from "~/styles/colors";

/**
 * An approved update's Markdown as sanitized HTML, for places that cannot run
 * the React renderer (RSS, email): through the shared document schema and the
 * same public sanitization pass as published Pages (ADR-0038), so only
 * schema-known nodes and http(s)/mailto links survive.
 */
export function renderUpdateHtml(markdown: string): string {
  return renderPublicPageHtml(markdownToDocServer(markdown));
}

const t = colorTokens.light;
/**
 * Inline styles per tag: email clients drop stylesheets and ignore the app's
 * Tailwind classes, so without these every heading falls back to the client's
 * huge default and each bullet reads as its own paragraph.
 */
const EMAIL_TAG_STYLES: Record<string, string> = {
  h1: `margin: 24px 0 8px; font-size: 20px; line-height: 1.3; color: ${t.text.primary};`,
  // Section labels ("Highlights", "Also shipped"): small, quiet, uppercase.
  h2: `margin: 28px 0 10px; font-size: 12px; font-weight: bold; letter-spacing: 0.06em; text-transform: uppercase; color: ${t.text.muted};`,
  h3: `margin: 18px 0 4px; font-size: 17px; line-height: 1.4; color: ${t.text.primary};`,
  h4: `margin: 16px 0 4px; font-size: 15px; color: ${t.text.primary};`,
  p: "margin: 0 0 12px; line-height: 1.6;",
  ul: "margin: 0 0 12px; padding-left: 20px;",
  ol: "margin: 0 0 12px; padding-left: 20px;",
  li: "margin: 0 0 6px; line-height: 1.5;",
  a: `color: ${t.brand.primary}; text-decoration: none;`,
  blockquote: `margin: 0 0 12px; padding-left: 12px; border-left: 3px solid ${t.border.primary}; color: ${t.text.secondary};`,
  hr: `border: none; border-top: 1px solid ${t.border.primary}; margin: 20px 0;`,
};

/**
 * An approved update's Markdown as HTML for email: the sanitized
 * {@link renderUpdateHtml} output with inline styles and without the app's
 * class names, and list items unwrapped from their paragraphs so bullets stay
 * tight. Operates only on the sanitizer's own output, whose tags are known.
 */
export function renderUpdateEmailHtml(markdown: string): string {
  return renderUpdateHtml(markdown)
    .replace(/\s(?:class|data-tight)="[^"]*"/g, "")
    .replace(/<li><p>([\s\S]*?)<\/p><\/li>/g, "<li>$1</li>")
    .replace(/<(h[1-4]|p|ul|ol|li|a|blockquote|hr)(?=[\s>/])/g, (tag, name: string) => {
      const style = EMAIL_TAG_STYLES[name];
      return style ? `${tag} style="${style}"` : tag;
    });
}

