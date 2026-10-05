import { FEATURE_STATUS_LABELS, FEATURE_STATUS_ORDER } from "~/lib/feature-statuses";
import { PRIORITY_LABELS } from "~/app/_components/product/PriorityIcon";
import { PRIORITY_NONE, priorityPillValue } from "~/app/_components/product/priorityPill";

// ---------------------------------------------------------------------------
// Filters — pure, testable core of the Features list's Filter popover.
//
// Mirrors the Backlog's facets where a Feature has the same field (status,
// priority, labels) and swaps the ticket-only ones (type, DRI, epic, cycle)
// for the two a Feature is carved by: its Area and the Goal it serves.
// ---------------------------------------------------------------------------

export type FeatureFilterKey = "status" | "priority" | "area" | "goal" | "labels";

export type FeatureFilters = Record<FeatureFilterKey, string[]>;

// Arrays are never mutated in place (all updates spread), so a shared empty
// reference is safe to use as the default / cleared state.
export const EMPTY_FEATURE_FILTERS: FeatureFilters = {
  status: [], priority: [], area: [], goal: [], labels: [],
};

export const FEATURE_FILTER_FACETS: Array<{ key: FeatureFilterKey; label: string }> = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "area", label: "Area" },
  { key: "goal", label: "Goal" },
  { key: "labels", label: "Labels" },
];

/** Synthetic facet value for the unset bucket (no priority / area / goal). */
export const FILTER_NONE = PRIORITY_NONE;

export type FeatureFacetOptions = Record<FeatureFilterKey, Array<{ value: string; label: string }>>;

/** Minimal feature shape the filter logic reads. */
export interface FilterableFeature {
  status: string;
  priority?: number | null;
  area?: { id: string; name: string; displayOrder?: number } | null;
  goal?: { id: number; title: string } | null;
  tags?: Array<{ tag: { id: string; name: string } }>;
}

// The table's Priority pill shows a stored 4 and an unset priority as the one
// "None" choice, so the filter treats them as one bucket too.
const priorityKey = (f: FilterableFeature) => priorityPillValue(f.priority);
const areaKey = (f: FilterableFeature) => f.area?.id ?? FILTER_NONE;
const goalKey = (f: FilterableFeature) => (f.goal ? String(f.goal.id) : FILTER_NONE);

/**
 * Facet options derived from the loaded features, so only values actually
 * present in the product are offered. A bucketed facet (every feature sits in
 * exactly one bucket) with a single bucket can't narrow anything and is left
 * out; the popover skips a facet with no options.
 */
export function buildFeatureFacetOptions(features: FilterableFeature[]): FeatureFacetOptions {
  const status = new Map<string, string>();
  const priority = new Map<string, string>();
  const area = new Map<string, { label: string; order: number }>();
  const goal = new Map<string, string>();
  const labels = new Map<string, string>();

  for (const f of features) {
    status.set(f.status, FEATURE_STATUS_LABELS[f.status] ?? f.status);
    const pKey = priorityKey(f);
    priority.set(pKey, pKey === FILTER_NONE ? "No priority" : (PRIORITY_LABELS[Number(pKey)] ?? pKey));
    area.set(areaKey(f), { label: f.area?.name ?? "No area", order: f.area?.displayOrder ?? 0 });
    goal.set(goalKey(f), f.goal?.title ?? "No goal");
    for (const x of f.tags ?? []) labels.set(x.tag.id, x.tag.name);
  }

  const toOpts = (m: Map<string, string>) =>
    Array.from(m, ([value, label]) => ({ value, label }));
  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  // The unset bucket always sorts last.
  const noneLast = (a: { value: string }, b: { value: string }) =>
    a.value === FILTER_NONE ? 1 : b.value === FILTER_NONE ? -1 : 0;
  const narrowing = <T,>(opts: T[]) => (opts.length > 1 ? opts : []);

  return {
    status: narrowing(
      toOpts(status).sort(
        (a, b) => (FEATURE_STATUS_ORDER[a.value] ?? 99) - (FEATURE_STATUS_ORDER[b.value] ?? 99),
      ),
    ),
    priority: narrowing(
      toOpts(priority).sort(
        (a, b) => noneLast(a, b) || Number(a.value) - Number(b.value),
      ),
    ),
    // Areas follow the product's own ordering, like the Area grouping.
    area: narrowing(
      Array.from(area, ([value, { label, order }]) => ({ value, label, order }))
        .sort((a, b) => noneLast(a, b) || a.order - b.order || byLabel(a, b))
        .map(({ value, label }) => ({ value, label })),
    ),
    goal: narrowing(toOpts(goal).sort((a, b) => noneLast(a, b) || byLabel(a, b))),
    labels: toOpts(labels).sort(byLabel),
  };
}

/** Values within a facet are OR-ed; facets are AND-ed. An empty facet passes. */
export function matchesFeatureFilters(f: FilterableFeature, filters: FeatureFilters): boolean {
  if (filters.status.length && !filters.status.includes(f.status)) return false;
  if (filters.priority.length && !filters.priority.includes(priorityKey(f))) return false;
  if (filters.area.length && !filters.area.includes(areaKey(f))) return false;
  if (filters.goal.length && !filters.goal.includes(goalKey(f))) return false;
  if (filters.labels.length && !(f.tags ?? []).some((x) => filters.labels.includes(x.tag.id))) return false;
  return true;
}

export function countActiveFeatureFilters(filters: FeatureFilters): number {
  return FEATURE_FILTER_FACETS.reduce((n, facet) => n + filters[facet.key].length, 0);
}

/**
 * Saved prefs are untrusted JSON - guard each facet is actually an array of
 * strings. Stale values (e.g. a deleted area id) are kept: they match no
 * features, and their toolbar pill is how the user clears them.
 */
export function parseSavedFeatureFilters(raw: unknown): FeatureFilters {
  if (!raw || typeof raw !== "object") return EMPTY_FEATURE_FILTERS;
  const saved = raw as Partial<Record<FeatureFilterKey, unknown>>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    status: arr(saved.status),
    priority: arr(saved.priority),
    area: arr(saved.area),
    goal: arr(saved.goal),
    labels: arr(saved.labels),
  };
}
