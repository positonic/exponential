import type { PublicUpdateSummary, PublicWorkspace } from "./public";
import { publicUpdatePath, publicUpdatesPath } from "./public";

/** Escape text for XML element content and attributes. */
export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plainExcerpt(markdown: string): string {
  const text = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
}

/**
 * RSS 2.0 for a workspace's public updates. Every piece of record text is
 * XML-escaped (no CDATA, which a title containing "]]>" would break out of);
 * the full post rides in content:encoded as escaped, already-sanitized HTML.
 */
export function buildUpdatesFeed(input: {
  workspace: PublicWorkspace;
  updates: PublicUpdateSummary[];
  baseUrl: string;
  renderHtml: (markdown: string) => string;
  now: Date;
}): string {
  const { workspace, baseUrl } = input;
  const indexUrl = `${baseUrl}${publicUpdatesPath(workspace.slug)}`;
  const items = input.updates
    .map((update) => {
      const url = `${baseUrl}${publicUpdatePath(workspace.slug, update.id)}`;
      return `
    <item>
      <title>${xmlEscape(update.title)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <pubDate>${update.publishedAt.toUTCString()}</pubDate>
      <description>${xmlEscape(plainExcerpt(update.body))}</description>
      <content:encoded>${xmlEscape(input.renderHtml(update.body))}</content:encoded>
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xmlEscape(`${workspace.name} updates`)}</title>
    <link>${xmlEscape(indexUrl)}</link>
    <description>${xmlEscape(`What ${workspace.name} shipped, week by week.`)}</description>
    <language>en</language>
    <lastBuildDate>${input.now.toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(`${indexUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>`;
}
