/**
 * Utility functions for the application
 */

/**
 * Strip HTML tags and decode HTML entities from a string
 * @param html - The HTML string to clean
 * @returns Clean text without HTML tags or entities
 */
/** Check if a string looks like a URL */
function isLikelyUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

/**
 * Transform URLs in HTML content to compact [link] displays.
 *
 * Handles two cases:
 * 1. <a> tags where the visible text is itself a URL → replaced with [link] at end
 * 2. Raw plain-text URLs not inside tags → replaced with [link] at end
 *
 * <a> tags with non-URL display text (e.g., "click here") are left untouched.
 */
export function compactUrls(html: string): string {
  if (!html) return '';

  const collectedUrls: string[] = [];
  let result = html;

  // Phase 1: Handle <a> tags where anchor text looks like a URL
  result = result.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
    (match, href: string, anchorText: string) => {
      const trimmedText = anchorText.trim();
      if (isLikelyUrl(trimmedText)) {
        collectedUrls.push(href);
        return '';
      }
      return match;
    },
  );

  // Phase 2: Handle raw plain-text URLs not inside tags
  result = result.replace(
    /(?<![="'>])(https?:\/\/[^\s<>"']+)/g,
    (url: string) => {
      collectedUrls.push(url);
      return '';
    },
  );

  // Clean up extra whitespace
  result = result.replace(/\s+/g, ' ').trim();

  // Phase 3: Append [link] tags at the end
  if (collectedUrls.length > 0) {
    const linkTags = collectedUrls
      .map(
        (url) =>
          `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-brand-primary opacity-70 no-underline">[link]</a>`,
      )
      .join(' ');
    result = result + (result ? ' ' : '') + linkTags;
  }

  return result;
}

export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  
  return html
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Replace multiple whitespace with single space
    .replace(/\s+/g, ' ')
    // Trim whitespace
    .trim();
}