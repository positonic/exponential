/**
 * What the Knowledge base's quick-save box should store for a pasted value.
 * A lone URL is a bookmark to read later; anything else — a sentence, a
 * paragraph, a pasted markdown doc — is a note whose body is the text itself.
 */
export type QuickSave =
  | { kind: 'link'; url: string }
  | { kind: 'note'; title: string; content: string };

const TITLE_MAX = 80;

// A bare domain with an optional path, e.g. `example.com/post`. Requires a
// dot and no whitespace, so a one-word note never reads as a link.
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i;

function asHttpUrl(value: string): string | null {
  const candidate = BARE_DOMAIN.test(value) ? `https://${value}` : value;
  try {
    const parsed = new URL(candidate);
    // Return the text as typed, not `parsed.toString()`: the server
    // de-duplicates on exact URL, and normalising (a trailing `/`) would
    // miss rows saved before.
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return candidate;
  } catch {
    // not a URL
  }
  return null;
}

/** First non-blank line, with block markers and inline markdown stripped. */
export function titleFromText(text: string): string {
  const firstLine =
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
  const plain = firstLine
    .replace(/^(#{1,6}(\s+|$)|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|`|~~)/g, '')
    .trim();
  if (plain.length <= TITLE_MAX) return plain || 'Untitled note';
  const cut = plain.slice(0, TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > TITLE_MAX / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Null for blank input; otherwise a link or a note. */
export function classifyQuickSave(input: string): QuickSave | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/\s/.test(trimmed)) {
    const url = asHttpUrl(trimmed);
    if (url) return { kind: 'link', url };
  }
  return { kind: 'note', title: titleFromText(trimmed), content: trimmed };
}
