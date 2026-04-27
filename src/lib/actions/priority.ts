import { type Priority } from "~/types/priority";

export type { Priority };

// Priority order for sorting actions (lower number = higher priority).
// Covers all 11 Priority values from ~/types/priority.
export const PRIORITY_ORDER: Record<Priority, number> = {
  "1st Priority": 1,
  "2nd Priority": 2,
  "3rd Priority": 3,
  "4th Priority": 4,
  "5th Priority": 5,
  Quick: 6,
  Scheduled: 7,
  Errand: 8,
  Remember: 9,
  Watch: 10,
  "Someday Maybe": 11,
};

// Stable sort: priority rank, then id tiebreaker.
export function sortByPriority(
  a: { priority?: string | null; id: string },
  b: { priority?: string | null; id: string },
): number {
  const aRank = PRIORITY_ORDER[a.priority as Priority] ?? 999;
  const bRank = PRIORITY_ORDER[b.priority as Priority] ?? 999;
  if (aRank !== bRank) return aRank - bRank;
  return a.id.localeCompare(b.id);
}

export type VisualPriority = "urgent" | "high" | "normal" | "low";

export function toVisualPriority(
  priority: string | null | undefined,
  isOverdue: boolean,
): VisualPriority {
  if (isOverdue) return "urgent";
  const p = (priority ?? "") as Priority | "";
  if (p === "1st Priority") return "urgent";
  if (p === "2nd Priority" || p === "3rd Priority") return "high";
  if (p === "Remember" || p === "Watch") return "low";
  return "normal";
}

// Returns the CSS string used for the Mantine checkbox border color.
export function priorityCheckboxBorderVar(
  priority: string | null | undefined,
): string {
  switch (priority) {
    case "1st Priority":
      return "var(--mantine-color-red-filled)";
    case "2nd Priority":
      return "var(--mantine-color-orange-filled)";
    case "3rd Priority":
      return "var(--mantine-color-yellow-filled)";
    case "4th Priority":
      return "var(--mantine-color-green-filled)";
    case "5th Priority":
      return "var(--mantine-color-blue-filled)";
    case "Quick":
      return "var(--mantine-color-violet-filled)";
    case "Scheduled":
      return "var(--mantine-color-pink-filled)";
    case "Errand":
      return "var(--mantine-color-cyan-filled)";
    case "Remember":
      return "var(--mantine-color-indigo-filled)";
    case "Watch":
      return "var(--mantine-color-grape-filled)";
    default:
      return "var(--color-border-primary)";
  }
}
