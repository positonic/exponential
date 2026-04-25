"use client";

import { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FilterState } from "~/types/filter";
import type {
  ProjectSortState,
  SortDirection,
} from "~/app/_components/toolbar/useProjectSort";

const FILTER_KEYS = ["status", "priority", "driId"] as const;
const QUERY_PARAM = "q";
const SORT_PARAM = "sort";

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  NONE: 3,
};

const STATUS_ORDER: Record<string, number> = {
  ACTIVE: 0,
  ON_HOLD: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

const DATE_FIELDS = new Set([
  "createdAt",
  "startDate",
  "endDate",
  "reviewDate",
  "nextActionDate",
]);
const ENUM_FIELDS: Record<string, Record<string, number>> = {
  priority: PRIORITY_ORDER,
  status: STATUS_ORDER,
};

const DESC_DEFAULT_FIELDS = new Set(["createdAt", "startDate", "endDate"]);

function toDate(val: unknown): Date | null {
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseFilters(params: URLSearchParams): FilterState {
  const result: FilterState = {};
  for (const key of FILTER_KEYS) {
    const raw = params.get(key);
    if (raw) {
      const values = raw.split(",").filter(Boolean);
      if (values.length > 0) result[key] = values;
    }
  }
  return result;
}

function parseSort(params: URLSearchParams): ProjectSortState | null {
  const raw = params.get(SORT_PARAM);
  if (!raw) return null;
  const desc = raw.startsWith("-");
  const field = desc ? raw.slice(1) : raw;
  if (!field) return null;
  return { field, direction: desc ? "desc" : "asc" };
}

export interface ProjectViewState {
  filters: FilterState;
  setFilters: (next: FilterState | ((prev: FilterState) => FilterState)) => void;
  searchQuery: string;
  setSearchQuery: (next: string) => void;
  sortState: ProjectSortState | null;
  setSortField: (field: string) => void;
  clearSort: () => void;
  sortProjects: <T extends object>(items: T[]) => T[];
  viewParamsQueryString: string;
}

export function useProjectViewState(): ProjectViewState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const paramsString = searchParams.toString();
  const [, startTransition] = useTransition();

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(paramsString)),
    [paramsString],
  );
  const sortState = useMemo(
    () => parseSort(new URLSearchParams(paramsString)),
    [paramsString],
  );
  const searchQuery = searchParams.get(QUERY_PARAM) ?? "";

  const viewParamsQueryString = useMemo(() => {
    const params = new URLSearchParams(paramsString);
    const out = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = params.get(key);
      if (v) out.set(key, v);
    }
    const q = params.get(QUERY_PARAM);
    if (q) out.set(QUERY_PARAM, q);
    const s = params.get(SORT_PARAM);
    if (s) out.set(SORT_PARAM, s);
    return out.toString();
  }, [paramsString]);

  const updateParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(paramsString);
      mutator(params);
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      startTransition(() => {
        router.replace(url, { scroll: false });
      });
    },
    [router, pathname, paramsString],
  );

  const setFilters = useCallback(
    (next: FilterState | ((prev: FilterState) => FilterState)) => {
      updateParams((params) => {
        const resolved =
          typeof next === "function" ? next(parseFilters(params)) : next;
        for (const key of FILTER_KEYS) {
          const val = resolved[key];
          if (Array.isArray(val) && val.length > 0) {
            params.set(key, val.join(","));
          } else {
            params.delete(key);
          }
        }
      });
    },
    [updateParams],
  );

  const setSearchQuery = useCallback(
    (next: string) => {
      updateParams((params) => {
        if (next.trim()) params.set(QUERY_PARAM, next);
        else params.delete(QUERY_PARAM);
      });
    },
    [updateParams],
  );

  const setSortField = useCallback(
    (field: string) => {
      updateParams((params) => {
        const current = parseSort(params);
        let direction: SortDirection;
        if (current?.field === field) {
          direction = current.direction === "asc" ? "desc" : "asc";
        } else {
          direction = DESC_DEFAULT_FIELDS.has(field) ? "desc" : "asc";
        }
        params.set(SORT_PARAM, direction === "desc" ? `-${field}` : field);
      });
    },
    [updateParams],
  );

  const clearSort = useCallback(() => {
    updateParams((params) => {
      params.delete(SORT_PARAM);
    });
  }, [updateParams]);

  const sortProjects = useCallback(
    <T extends object>(items: T[]): T[] => {
      if (!sortState) return items;
      const { field, direction } = sortState;

      return [...items].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[field];
        const bVal = (b as Record<string, unknown>)[field];

        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        let comparison = 0;

        if (field in ENUM_FIELDS) {
          const order = ENUM_FIELDS[field]!;
          const aStr = typeof aVal === "string" ? aVal : "";
          const bStr = typeof bVal === "string" ? bVal : "";
          comparison = (order[aStr] ?? 99) - (order[bStr] ?? 99);
        } else if (DATE_FIELDS.has(field)) {
          const dateA = toDate(aVal);
          const dateB = toDate(bVal);
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          comparison = dateA.getTime() - dateB.getTime();
        } else if (typeof aVal === "number" && typeof bVal === "number") {
          comparison = aVal - bVal;
        } else {
          const aStr = typeof aVal === "string" ? aVal : JSON.stringify(aVal);
          const bStr = typeof bVal === "string" ? bVal : JSON.stringify(bVal);
          comparison = aStr.localeCompare(bStr);
        }

        return direction === "desc" ? -comparison : comparison;
      });
    },
    [sortState],
  );

  return {
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    sortState,
    setSortField,
    clearSort,
    sortProjects,
    viewParamsQueryString,
  };
}

export function filterProjects<
  T extends { status: string; priority: string; driId?: string | null },
>(projects: T[], filters: FilterState, searchQuery: string): T[] {
  const q = searchQuery.trim().toLowerCase();
  return projects.filter((p) => {
    const statusFilter = filters.status as string[] | undefined;
    if (statusFilter && statusFilter.length > 0) {
      if (!statusFilter.includes(p.status)) return false;
    }
    const priorityFilter = filters.priority as string[] | undefined;
    if (priorityFilter && priorityFilter.length > 0) {
      if (!priorityFilter.includes(p.priority)) return false;
    }
    const driFilter = filters.driId as string[] | undefined;
    if (driFilter && driFilter.length > 0) {
      if (!p.driId || !driFilter.includes(p.driId)) return false;
    }
    if (q) {
      const name = (p as unknown as { name?: string }).name ?? "";
      if (!name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}
