/**
 * Feature status definitions - single source of truth for feature-registry
 * labels, colors, and column ordering (list, detail, roadmap board). Mirrors
 * `~/lib/ticket-statuses` but for the `FeatureStatus` enum. See ADR-0035 and
 * CONTEXT.md "Feature".
 *
 * Lifecycle (Features V2): Idea -> Defined -> In progress -> Live ->
 * Deprecated (+ Archived). SHIPPED is the historical DB value for the Live
 * state - the UI ALWAYS displays "Live" (live is the state, shipping is the
 * event, recorded by FeatureScope.shippedAt). DEPRECATED = was live, sunset
 * by a human; ARCHIVED = registry housekeeping for things that never shipped.
 */

export type FeatureStatus =
  | "IDEA"
  | "DEFINED"
  | "IN_PROGRESS"
  | "SHIPPED"
  | "DEPRECATED"
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
  { value: "SHIPPED", label: "Live", color: "green", order: 3 },
  { value: "DEPRECATED", label: "Deprecated", color: "orange", order: 4 },
  { value: "ARCHIVED", label: "Archived", color: "dark", order: 5 },
];

/** Alias for Select-style consumers ({ value, label } is all they read). */
export const FEATURE_STATUS_OPTIONS = FEATURE_STATUSES;

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
 * Statuses the roadmap board hides behind the reveal toggle: ARCHIVED
 * (never product) and DEPRECATED (was product, sunset) are registry history,
 * not roadmap lanes.
 */
export const HIDDEN_FEATURE_STATUSES: FeatureStatus[] = ["DEPRECATED", "ARCHIVED"];

/**
 * The active roadmap columns (everything except the hidden statuses), in
 * board order. This is the default set of columns the board renders.
 */
export const ROADMAP_BOARD_COLUMNS = FEATURE_STATUSES.filter(
  (s) => !HIDDEN_FEATURE_STATUSES.includes(s.value),
);

/** Scope lifecycle - same "SHIPPED displays as Live" rule as features. */
export const SCOPE_STATUS_OPTIONS = [
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "SHIPPED", label: "Live" },
  { value: "DEPRECATED", label: "Deprecated" },
];

export const SCOPE_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  SCOPE_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export const SCOPE_STATUS_COLORS: Record<string, string> = {
  PLANNED: "gray",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  DEPRECATED: "orange",
};

/** EARS requirement kinds (ADR-0039). */
export const REQUIREMENT_KIND_OPTIONS = [
  { value: "FUNCTIONAL", label: "Functional" },
  { value: "NON_FUNCTIONAL", label: "Non-functional" },
  { value: "CONSTRAINT", label: "Constraint" },
];

export const REQUIREMENT_KIND_LABELS: Record<string, string> = Object.fromEntries(
  REQUIREMENT_KIND_OPTIONS.map((o) => [o.value, o.label]),
);
