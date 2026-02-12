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
      return parsed as FirefliesSummary;
    }
    return null;
  } catch {
    return null;
  }
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
