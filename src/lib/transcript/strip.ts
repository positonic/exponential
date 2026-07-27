/**
 * Remove `[SCREENSHOT]` markers (optionally followed by a period) and the inline
 * whitespace hugging them, collapsing to a single space. Newlines are preserved
 * so a marker at the end of a line never merges two turns together.
 */
export function stripScreenshots(raw: string): string {
  return raw.replace(/[^\S\n]*\[SCREENSHOT\]\.?[^\S\n]*/g, " ");
}
