"use client";

import { useState, useCallback } from "react";

export type SortDirection = "asc" | "desc";

export interface ProjectSortState {
  field: string;
  direction: SortDirection;
}

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

const DATE_FIELDS = new Set(["createdAt", "startDate", "endDate", "reviewDate", "nextActionDate"]);
const ENUM_FIELDS: Record<string, Record<string, number>> = {
  priority: PROJECT_PRIORITY_RANK,
  status: STATUS_ORDER,
};

// Fields that default to descending when first selected
const DESC_DEFAULT_FIELDS = new Set(["createdAt", "startDate", "endDate"]);

function toDate(val: unknown): Date | null {
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function useProjectSort() {
  const [sortState, setSortState] = useState<ProjectSortState | null>(null);

  const setSortField = useCallback((field: string) => {
    setSortState((prev) => {
      if (prev?.field === field) {
        return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { field, direction: DESC_DEFAULT_FIELDS.has(field) ? "desc" : "asc" };
    });
  }, []);

  const clearSort = useCallback(() => {
    setSortState(null);
  }, []);

  const sortProjects = useCallback(
    <T extends object>(items: T[]): T[] => {
      if (!sortState) return items;
      const { field, direction } = sortState;

      return [...items].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[field];
        const bVal = (b as Record<string, unknown>)[field];

        // Nulls always go to end
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

  return { sortState, setSortField, clearSort, sortProjects };
}
