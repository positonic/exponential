/**
 * Utility functions for the application
 */

/**
 * Strip HTML tags and decode HTML entities from a string
 * @param html - The HTML string to clean
 * @returns Clean text without HTML tags or entities
 */
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