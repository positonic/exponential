"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FilterState } from "~/types/filter";
import type {
  ProjectSortState,
  SortDirection,
} from "~/app/_components/toolbar/useProjectSort";

const FILTER_KEYS = ["status", "priority", "driId"] as const;
const QUERY_PARAM = "q";
const SORT_PARAM = "sort";

/**
 * How long to wait after the last keystroke before writing `?q=` to the URL.
 *
 * Writing it per-keystroke means a `router.replace()` per character, and the
 * `(sidemenu)` route group is served by an async *server* layout — so every one
 * of those replaces refetches the whole RSC tree. That is what made the search
 * box feel like it was reloading the page as you typed.
 */
const SEARCH_URL_DEBOUNCE_MS = 350;

const PROJECT_PRIORITY_RANK: Record<string, number> = {
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
  priority: PROJECT_PRIORITY_RANK,
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
  /** Live text — bind this to the search `<input value>`. Updates synchronously. */
  searchQuery: string;
  /**
   * Deferred copy of {@link searchQuery}. Filter list rendering off this so a
   * slow re-render of the results never blocks the next keystroke.
   */
  deferredSearchQuery: string;
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
  const urlSearchQuery = searchParams.get(QUERY_PARAM) ?? "";

  // The input is driven by local state, not by the URL. The URL is a *mirror*
  // that catches up once typing pauses (see SEARCH_URL_DEBOUNCE_MS).
  const [searchQuery, setSearchQueryState] = useState(urlSearchQuery);
  // Last value this hook wrote to the URL, so we can tell our own echo apart
  // from an external change (back/forward, a link carrying `?q=`).
  const lastWrittenQueryRef = useRef(urlSearchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const viewParamsQueryString = useMemo(() => {
    const params = new URLSearchParams(paramsString);
    const out = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = params.get(key);
      if (v) out.set(key, v);
    }
    // Use the live text, not the URL's — a view-tab link clicked mid-debounce
    // should still carry what the user has typed.
    if (searchQuery.trim()) out.set(QUERY_PARAM, searchQuery);
    const s = params.get(SORT_PARAM);
    if (s) out.set(SORT_PARAM, s);
    return out.toString();
  }, [paramsString, searchQuery]);

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

  // A debounced write fires from a timer, so it must not capture a stale
  // `updateParams` (which closes over `paramsString`) — read the latest here.
  const updateParamsRef = useRef(updateParams);
  useEffect(() => {
    updateParamsRef.current = updateParams;
  }, [updateParams]);

  // Adopt external URL changes (back/forward, or landing on a `?q=` link), but
  // ignore our own debounced write coming back around.
  useEffect(() => {
    if (urlSearchQuery === lastWrittenQueryRef.current) return;
    lastWrittenQueryRef.current = urlSearchQuery;
    setSearchQueryState(urlSearchQuery);
  }, [urlSearchQuery]);

  // Never let a queued write land after unmount — it would navigate a page the
  // user has already left.
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

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

  const setSearchQuery = useCallback((next: string) => {
    // Synchronous: the caret and the visible text never wait on the router.
    setSearchQueryState(next);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null;
      const trimmed = next.trim();
      lastWrittenQueryRef.current = trimmed ? next : "";
      updateParamsRef.current((params) => {
        if (trimmed) params.set(QUERY_PARAM, next);
        else params.delete(QUERY_PARAM);
      });
    }, SEARCH_URL_DEBOUNCE_MS);
  }, []);

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
    deferredSearchQuery,
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
