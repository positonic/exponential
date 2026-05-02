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

export type VisualPriority =
  | "urgent"
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "quick"
  | "scheduled"
  | "errand"
  | "remember"
  | "watch"
  | "someday"
  | "normal";

export function toVisualPriority(
  priority: string | null | undefined,
  isOverdue: boolean,
): VisualPriority {
  if (isOverdue) return "urgent";
  const p = (priority ?? "") as Priority | "";
  switch (p) {
    case "1st Priority":
      return "p1";
    case "2nd Priority":
      return "p2";
    case "3rd Priority":
      return "p3";
    case "4th Priority":
      return "p4";
    case "5th Priority":
      return "p5";
    case "Quick":
      return "quick";
    case "Scheduled":
      return "scheduled";
    case "Errand":
      return "errand";
    case "Remember":
      return "remember";
    case "Watch":
      return "watch";
    case "Someday Maybe":
      return "someday";
    default:
      return "normal";
  }
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
