import type { FilterBarConfig, FilterState } from "~/types/filter";

export function filtersToSearchParams(
  filters: FilterState,
  params: URLSearchParams,
): void {
  for (const [key, val] of Object.entries(filters)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      if (val.length > 0) params.set(key, val.join(","));
    } else if (val === true) {
      params.set(key, "1");
    }
  }
}

export function filtersFromSearchParams(
  searchParams: URLSearchParams | { get(key: string): string | null },
  config: FilterBarConfig,
  reservedKeys: ReadonlySet<string>,
): FilterState {
  const result: FilterState = {};
  for (const field of config.fields) {
    if (reservedKeys.has(field.key)) continue;
    const raw = searchParams.get(field.key);
    if (raw == null) continue;
    if (field.type === "boolean") {
      if (raw === "1" || raw === "true") result[field.key] = true;
    } else {
      const parts = raw.split(",").filter(Boolean);
      if (parts.length > 0) result[field.key] = parts;
    }
  }
  return result;
}
