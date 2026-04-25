import type { Heading } from "./types";

/**
 * Extract headings (h2, h3) from markdown content for table of contents
 */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    // Match h2 and h3 headings (## and ###)
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const level = match[1]?.length ?? 2;
      const text = match[2]?.trim() ?? "";

      // Generate ID from text (slug-like)
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();

      headings.push({ id, text, level });
    }
  }

  return headings;
}
