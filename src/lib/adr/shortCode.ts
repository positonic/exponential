/**
 * Short-code auto-suggest for ADR enrolment (Decision Log). A short code is a
 * workspace-unique label prefix — ADRs render as `SHORTCODE-NUMBER`
 * (API-0003). Suggestions favour the most distinctive word of the repo name
 * and de-conflict by extending with further letters (PIPE → PIPEL → …), then
 * digits — never by inventing unrelated suffixes.
 */

const MAX_LEN = 10;
const BASE_LEN = 4;

/** Uppercase alphanumeric word candidates from a repo name, most distinctive last. */
function words(repoName: string): string[] {
  return repoName
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toUpperCase());
}

export function suggestShortCode(
  repoName: string,
  taken: ReadonlySet<string> = new Set(),
): string {
  const parts = words(repoName);
  // Last word tends to be the distinctive one ("clear-api" → API,
  // "clear-context-pipeline" → PIPELINE). Fall back to the whole name.
  const source = parts[parts.length - 1] ?? "ADR";
  // Short codes must start with a letter; strip leading digits.
  const letters = source.replace(/^[0-9]+/, "") || "ADR";

  const base = letters.slice(0, Math.min(BASE_LEN, MAX_LEN));
  if (!taken.has(base)) return base;

  // Extend with the word's own next letters first…
  for (let len = base.length + 1; len <= Math.min(letters.length, MAX_LEN); len++) {
    const candidate = letters.slice(0, len);
    if (!taken.has(candidate)) return candidate;
  }
  // …then fall back to numeric suffixes.
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, MAX_LEN - String(n).length)}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}
