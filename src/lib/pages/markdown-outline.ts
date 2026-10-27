/**
 * Cheap structural reads of a Page's Markdown projection, so an agent can ask
 * for a page's shape (headings only) or one section instead of the whole body.
 * Pure string work on ATX headings (`# …` to `###### …`); headings inside
 * fenced code blocks are not headings.
 */

export interface OutlineEntry {
  /** Heading depth, 1–6. */
  level: number;
  /** Heading text without the leading/trailing `#`s. */
  text: string;
  /** 0-based line index in the Markdown. */
  line: number;
}

export interface MarkdownSection {
  heading: OutlineEntry;
  /** The heading line through to the line before the next heading of the same or a higher level. */
  body: string;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

export function markdownOutline(markdown: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  let inFence = false;
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING.exec(line);
    if (!match) continue;
    const text = (match[2] ?? "").trim();
    if (!text) continue;
    entries.push({ level: match[1]!.length, text, line: i });
  }
  return entries;
}

/** Heading text normalised for matching: case, surrounding `#`s and whitespace ignored. */
function normaliseHeading(value: string): string {
  return value
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s*#+$/, "")
    .trim()
    .toLowerCase();
}

/**
 * The section under the heading whose text matches `heading` (exact match
 * first, then the first heading that starts with it). Null when no heading
 * matches.
 */
export function extractMarkdownSection(
  markdown: string,
  heading: string,
): MarkdownSection | null {
  const outline = markdownOutline(markdown);
  const wanted = normaliseHeading(heading);
  if (!wanted) return null;
  const target =
    outline.find((entry) => normaliseHeading(entry.text) === wanted) ??
    outline.find((entry) => normaliseHeading(entry.text).startsWith(wanted));
  if (!target) return null;

  const lines = markdown.split("\n");
  const next = outline.find(
    (entry) => entry.line > target.line && entry.level <= target.level,
  );
  const end = next ? next.line : lines.length;
  return {
    heading: target,
    body: lines.slice(target.line, end).join("\n").trimEnd(),
  };
}

/** UTF-8 size of a body, the number an agent budgets context against. */
export function markdownBytes(markdown: string | null | undefined): number {
  return markdown ? Buffer.byteLength(markdown, "utf8") : 0;
}
