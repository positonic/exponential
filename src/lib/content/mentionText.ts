/**
 * Mention text transforms for comment composers.
 *
 * Stored comments carry the canonical mention markup `@[Name](userId)` — the
 * server parses it for notification fan-out and remarkMentions renders it as a
 * badge. Composers show the friendlier display form `@Name` instead: markup
 * collapses to display text when a comment is loaded for editing
 * (`collapseMentions`), and display text expands back to markup on submit
 * (`expandMentions`). Only names on the current candidate list are transformed
 * in either direction, so a mention of someone who has since left the
 * workspace survives an edit round-trip untouched.
 */

export interface MentionRef {
  id: string;
  name: string;
}

const MENTION_MARKUP_RE = /@\[([^\]\n]+)\]\(([^()\s]+)\)/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rewrite `@[Name](id)` markup as plain `@Name` for known candidate names. */
export function collapseMentions(
  text: string,
  candidates: MentionRef[],
): string {
  if (!text || candidates.length === 0) return text;
  const known = new Set(candidates.map((c) => c.name.toLowerCase()));
  return text.replace(MENTION_MARKUP_RE, (match, name: string) =>
    known.has(name.toLowerCase()) ? `@${name}` : match,
  );
}

/**
 * Rewrite plain `@Name` as `@[Name](id)` markup for known candidate names.
 * Longest name wins ("@James Farrell" beats a "James" candidate), matching is
 * case-insensitive, and the markup gets the candidate's canonical name.
 * Existing markup passes through untouched.
 */
export function expandMentions(
  text: string,
  candidates: MentionRef[],
): string {
  if (!text || candidates.length === 0) return text;

  const byName = new Map<string, MentionRef>();
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, c);
  }

  const alternation = [...byName.values()]
    .sort((a, b) => b.name.length - a.name.length)
    .map((c) => escapeRegExp(c.name))
    .join("|");
  // A leading-position capture instead of a lookbehind (older Safari); the
  // trailing guard stops "@JamesX" from half-matching a "James" candidate.
  const displayRe = new RegExp(`(^|[^\\w])@(${alternation})(?![\\w])`, "gi");

  const expandSegment = (segment: string): string =>
    segment.replace(displayRe, (full, prefix: string, name: string) => {
      const ref = byName.get(name.toLowerCase());
      return ref ? `${prefix}@[${ref.name}](${ref.id})` : full;
    });

  // Expand only the stretches between existing markup, never inside it.
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_MARKUP_RE)) {
    parts.push(expandSegment(text.slice(last, m.index)));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  parts.push(expandSegment(text.slice(last)));
  return parts.join("");
}
