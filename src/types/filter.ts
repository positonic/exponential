import { type Icon as TablerIcon } from "@tabler/icons-react";

/** Supported filter field types */
export type FilterFieldType = "multi-select" | "user" | "boolean";

/** Base fields shared by all filter field definitions */
interface BaseFilterField {
  /** Unique key — matches the key in the filter state object */
  key: string;
  /** Human-readable label shown in the field picker dropdown */
  label: string;
  /** Optional Tabler icon component */
  icon?: TablerIcon;
  /** Mantine color name for active filter badges (e.g. "blue", "grape") */
  badgeColor?: string;
}

/** Static enum options (status, priority, type, etc.) */
export interface MultiSelectFilterField extends BaseFilterField {
  type: "multi-select";
  options: Array<{ value: string; label: string }>;
}

/** Workspace member picker (DRI, assignees) */
export interface UserFilterField extends BaseFilterField {
  type: "user";
}

/** Boolean toggle (include completed, etc.) */
export interface BooleanFilterField extends BaseFilterField {
  type: "boolean";
}

/** Discriminated union of all filter field types */
export type FilterField =
  | MultiSelectFilterField
  | UserFilterField
  | BooleanFilterField;

/** Generic filter state: key → selected values */
export type FilterState = Record<
  string,
  string[] | boolean | undefined
>;

/** Page-level configuration for the FilterBar */
export interface FilterBarConfig {
  fields: FilterField[];
}

/** Check whether any filters are currently active */
export function hasActiveFilters(
  config: FilterBarConfig,
  filters: FilterState,
): boolean {
  return config.fields.some((f) => {
    const val = filters[f.key];
    if (val === undefined) return false;
    if (Array.isArray(val)) return val.length > 0;
    return val === true;
  });
}

/** Member shape expected by user-type filter fields */
export interface FilterMember {
  id: string;
  name: string | null;
  email?: string | null;
  image?: string | null;
}
