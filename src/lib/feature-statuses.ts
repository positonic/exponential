/**
 * Feature status definitions — single source of truth for the Product Roadmap
 * board's labels, colors, and column ordering. Mirrors `~/lib/ticket-statuses`
 * but for the `FeatureStatus` enum (`IDEA → DEFINED → IN_PROGRESS → SHIPPED →
 * ARCHIVED`). See ADR-0035.
 */

export type FeatureStatus =
  | "IDEA"
  | "DEFINED"
  | "IN_PROGRESS"
  | "SHIPPED"
  | "ARCHIVED";

export const FEATURE_STATUSES: Array<{
  value: FeatureStatus;
  label: string;
  color: string;
  order: number;
}> = [
  { value: "IDEA", label: "Idea", color: "gray", order: 0 },
  { value: "DEFINED", label: "Defined", color: "blue", order: 1 },
  { value: "IN_PROGRESS", label: "In progress", color: "yellow", order: 2 },
  { value: "SHIPPED", label: "Shipped", color: "green", order: 3 },
  { value: "ARCHIVED", label: "Archived", color: "dark", order: 4 },
];

export const FEATURE_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  FEATURE_STATUSES.map((s) => [s.value, s.label]),
);

export const FEATURE_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  FEATURE_STATUSES.map((s) => [s.value, s.color]),
);

export const FEATURE_STATUS_ORDER: Record<string, number> = Object.fromEntries(
  FEATURE_STATUSES.map((s) => [s.value, s.order]),
);

/**
 * The status the Product Roadmap deliberately hides from its columns:
 * `ARCHIVED` is a filter toggle, not a lane (ADR-0035, slice #5).
 */
export const ARCHIVED_FEATURE_STATUS: FeatureStatus = "ARCHIVED";

/**
 * The active roadmap columns (everything except `ARCHIVED`), in board order.
 * This is the default set of columns the board renders.
 */
export const ROADMAP_BOARD_COLUMNS = FEATURE_STATUSES.filter(
  (s) => s.value !== ARCHIVED_FEATURE_STATUS,
);
