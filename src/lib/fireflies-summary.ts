import type { FirefliesSummary } from "~/server/services/FirefliesService";

/**
 * Attempt to parse a summary string as Fireflies JSON format.
 * Returns the parsed object if valid, or null if not JSON / not Fireflies format.
 */
export function parseFirefliesSummary(
  summary: string | null | undefined,
): FirefliesSummary | null {
  if (!summary) return null;
  try {
    const parsed: unknown =
      typeof summary === "string" ? JSON.parse(summary) : summary;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      ("keywords" in parsed ||
        "overview" in parsed ||
        "action_items" in parsed ||
        "gist" in parsed ||
        "short_summary" in parsed ||
        "meeting_type" in parsed)
    ) {
      return normalizeFirefliesSummary(parsed as Record<string, unknown>);
    }
    return null;
  } catch {
    return null;
  }
}

/** Fields the renderer `.map()`s over as `string[]`. */
const STRING_LIST_FIELDS = [
  "keywords",
  "bullet_gist",
  "shorthand_bullet",
  "topics_discussed",
] as const;

/**
 * Coerce a stored list field to `string[]`. Fireflies' API returns `bullet_gist`
 * and `shorthand_bullet` as one newline-separated string, and AI-generated
 * summaries are not always shaped as asked, so a stored value can be a string,
 * an object, or a mixed array (Sentry EXPONENTIAL-FRONTEND-4R:
 * `bullet_gist.map is not a function` on /recording/:id).
 */
export function toStringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number =>
        typeof item === "string" || typeof item === "number",
      )
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s+/, "").trim())
      .filter((line) => line.length > 0);
  }
  return undefined;
}

/**
 * Normalise a parsed summary at the read boundary so every consumer can trust
 * the `FirefliesSummary` types: list fields become `string[]` (or are dropped),
 * and `transcript_chapters` is dropped unless it is an array of objects.
 */
function normalizeFirefliesSummary(
  raw: Record<string, unknown>,
): FirefliesSummary {
  const out: Record<string, unknown> = { ...raw };
  for (const field of STRING_LIST_FIELDS) {
    const list = toStringList(raw[field]);
    if (list === undefined) delete out[field];
    else out[field] = list;
  }
  if (raw.transcript_chapters !== undefined) {
    out.transcript_chapters = Array.isArray(raw.transcript_chapters)
      ? raw.transcript_chapters.filter(
          (chapter): chapter is object =>
            typeof chapter === "object" && chapter !== null,
        )
      : undefined;
    if (out.transcript_chapters === undefined) delete out.transcript_chapters;
  }
  return out as FirefliesSummary;
}

/**
 * Check if a Fireflies summary has ALL empty fields.
 * Returns true if every field is empty string, empty array, or undefined/null.
 */
export function isEmptyFirefliesSummary(summary: FirefliesSummary): boolean {
  const isEmpty = (val: unknown): boolean => {
    if (val === undefined || val === null) return true;
    if (typeof val === "string") return val.trim() === "";
    if (Array.isArray(val)) return val.length === 0;
    return false;
  };

  return (
    isEmpty(summary.keywords) &&
    isEmpty(summary.action_items) &&
    isEmpty(summary.outline) &&
    isEmpty(summary.shorthand_bullet) &&
    isEmpty(summary.overview) &&
    isEmpty(summary.bullet_gist) &&
    isEmpty(summary.gist) &&
    isEmpty(summary.short_summary) &&
    isEmpty(summary.short_overview) &&
    isEmpty(summary.meeting_type) &&
    isEmpty(summary.topics_discussed) &&
    isEmpty(summary.transcript_chapters)
  );
}
