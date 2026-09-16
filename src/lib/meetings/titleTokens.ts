/**
 * Meeting-title normalisation shared by `transcription.findRelated` (related
 * meetings) and ceremony auto-attach (ADR-0059).
 */

// Title-token stopwords for `findRelated` matching.
//
// Tokens that appear in nearly every meeting title carry no signal for
// *relatedness*, so we strip them before computing overlap. The list is
// intentionally narrow (meeting-pattern words + common articles/prepositions);
// domain-specific vocabulary like project names or topics MUST pass through.
export const TITLE_STOPWORDS: ReadonlySet<string> = new Set([
  // meeting-pattern words
  "meeting",
  "call",
  "sync",
  "weekly",
  "daily",
  "monthly",
  "quarterly",
  "standup",
  "checkin",
  "check-in",
  "review",
  "1:1",
  "1-1",
  "1on1",
  "one-on-one",
  "discussion",
  "session",
  "huddle",
  "catchup",
  "catch-up",
  // common articles / prepositions
  "the",
  "a",
  "an",
  "and",
  "or",
  "with",
  "at",
  "of",
  "to",
  "for",
  "in",
  "on",
  "by",
  "vs",
  "via",
  "re",
]);

/** Lowercase, split on non-alphanumerics, drop empties, de-duplicate in order. */
export function normaliseTitleTokens(title: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length > 0 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Tokenize a meeting title for related-meeting matching: lowercase, split
 * on non-alphanumeric, drop empty + stopwords. Returns a unique-token list
 * (caller wraps in Set if needed).
 */
export function tokenizeTitle(title: string): string[] {
  return normaliseTitleTokens(title).filter((t) => !TITLE_STOPWORDS.has(t));
}
