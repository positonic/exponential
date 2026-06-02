/**
 * Pure action-matching logic (ticket #5) — no I/O, no server-only imports, so it
 * is safe to unit-test in any environment. The DB-touching resolver
 * (actionResolver.ts) composes these.
 *
 * Safety-critical: decideResolution NEVER silently picks one action when several
 * match equally — it returns "ambiguous". This underpins "zero destructive
 * mistakes".
 */

// Imperative filler the Realtime model tends to pass through in the phrase.
// Stripped before matching so "mark the JWT refactor as done" matches an action
// named "JWT refactor".
const FILLER_PATTERNS: RegExp[] = [
  /\bmark(?:\s+off)?\b/gi,
  /\bcomplete[d]?\b/gi,
  /\bfinish(?:ed)?\b/gi,
  /\bclose\b/gi,
  /\bas\s+done\b/gi,
  /\bdone\b/gi,
  /\bplease\b/gi,
  /\bthe\b/gi,
  /\bmy\b/gi,
  /\baction\b/gi,
  /\btask\b/gi,
];

/** Reduce a spoken phrase to the core action description for matching. */
export function normalizeDescription(phrase: string): string {
  let s = phrase.toLowerCase();
  for (const re of FILLER_PATTERNS) s = s.replace(re, " ");
  return s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Score a single candidate name against an already-normalized query. 0 = no match. */
function scoreName(nameNorm: string, qNorm: string, qTokens: string[]): number {
  if (!nameNorm) return 0;
  if (nameNorm === qNorm) return 100;
  if (nameNorm.startsWith(qNorm) || qNorm.startsWith(nameNorm)) return 80;
  if (nameNorm.includes(qNorm) || qNorm.includes(nameNorm)) return 60;
  const nameTokens = new Set(nameNorm.split(" ").filter(Boolean));
  if (qTokens.length > 0 && qTokens.every((t) => nameTokens.has(t))) return 40;
  return 0;
}

/**
 * Rank candidates by match strength (exact > prefix > substring > token-subset),
 * dropping non-matches. Pure; used by both decideResolution and tests.
 */
export function rankActionMatches<T extends { name: string }>(
  query: string,
  candidates: T[],
): T[] {
  const qNorm = normalizeDescription(query);
  if (!qNorm) return [];
  const qTokens = qNorm.split(" ").filter(Boolean);

  return candidates
    .map((item) => ({ item, score: scoreName(normalizeDescription(item.name), qNorm, qTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}

export type MatchDecision<T> =
  | { kind: "one"; item: T }
  | { kind: "ambiguous"; items: T[] }
  | { kind: "none" };

/**
 * Decide a single match vs ambiguity. A lone best score is "one"; a tie at the
 * top score is "ambiguous" (never silently picked).
 */
export function decideResolution<T extends { name: string }>(
  query: string,
  candidates: T[],
): MatchDecision<T> {
  const qNorm = normalizeDescription(query);
  const qTokens = qNorm.split(" ").filter(Boolean);
  const ranked = rankActionMatches(query, candidates);
  if (ranked.length === 0) return { kind: "none" };
  if (ranked.length === 1) return { kind: "one", item: ranked[0]! };

  const top = scoreName(normalizeDescription(ranked[0]!.name), qNorm, qTokens);
  const topTier = ranked.filter(
    (r) => scoreName(normalizeDescription(r.name), qNorm, qTokens) === top,
  );
  return topTier.length === 1
    ? { kind: "one", item: ranked[0]! }
    : { kind: "ambiguous", items: topTier };
}
