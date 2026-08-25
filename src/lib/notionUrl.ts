/**
 * Canonical Notion page URL derived from a page id. Notion serves
 * https://www.notion.so/<32-hex-id> for any page the viewer can access, so
 * this is a safe deep-link fallback for sync records that predate URL
 * capture (the adoption cohort stored only the page id).
 */
export function notionPageUrl(pageId: string): string | null {
  const hex = pageId.replace(/-/g, "");
  return /^[0-9a-f]{32}$/i.test(hex) ? `https://www.notion.so/${hex}` : null;
}
