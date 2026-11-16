import { parseFirefliesSummary } from "~/lib/fireflies-summary";

/**
 * The curated text of a stored summary: the Fireflies-shaped JSON's themed
 * breakdown, bullets and overview joined as one document, or the plain
 * string as-is. The summary prompts ask for "Decision:" / "Agreed:"
 * callouts and a "Key Decisions" section, which is exactly what the
 * deterministic notes parser reads — along with the "Open question:" /
 * "Still open:" callouts it turns into open questions.
 */
export function summaryDecisionText(summary: string | null | undefined): string {
  if (!summary?.trim()) return "";
  const parsed = parseFirefliesSummary(summary);
  if (!parsed) return summary;
  const parts = [
    parsed.detailed_breakdown ?? "",
    (parsed.shorthand_bullet ?? []).map((line) => (/^\s*[-*•]/.test(line) ? line : `- ${line}`)).join("\n"),
    parsed.overview ?? "",
  ];
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}
