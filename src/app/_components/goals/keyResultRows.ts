import type {
  ObjectiveCardKeyResult,
  ObjectiveCardObjective,
} from "~/plugins/okr/client/components/ObjectiveCardV2";
import type { FilterState } from "~/types/filter";
import {
  effectiveStatus,
  krProgress,
  statusToConfidence,
  type Confidence,
} from "~/plugins/okr/client/utils/okrDashboardUtils";
import type { HealthFilterValue } from "./goalFilters";

export interface KeyResultRowUser {
  id: string;
  name: string | null;
  email?: string | null;
  image: string | null;
}

/** One row of the Key results view: a key result with its objective beside it. */
export interface KeyResultRowData {
  id: string;
  title: string;
  objectiveId: number;
  objectiveTitle: string;
  /** The parent objective's lifecycle status — what the Status filter reads. */
  objectiveStatus: string;
  driUserId: string | null;
  driUser: KeyResultRowUser | null;
  currentValue: number;
  targetValue: number;
  startValue: number;
  unit: string | undefined;
  unitLabel: string | null | undefined;
  /** 0–100, start→target, clamped. */
  progress: number;
  /** ADR-0004: `statusOverride ?? status`. */
  effectiveStatus: string;
  confidence: Confidence;
  lastCheckInAt: Date | null;
  period: string | undefined;
}

/**
 * Flatten the OKRs payload into one row per key result. Same objectives, same
 * period scope, same Mine rule as the other views — the Key results view is a
 * rendering of the list, not a second source of truth for which KRs belong
 * to a period (D-0041).
 */
export function flattenKeyResultRows(
  objectives: (ObjectiveCardObjective & { status?: string })[],
): KeyResultRowData[] {
  return objectives.flatMap((objective) =>
    objective.keyResults.map((kr: ObjectiveCardKeyResult): KeyResultRowData => {
      const status = effectiveStatus(kr.statusOverride, kr.status) ?? "not-started";
      const latestCheckIn = kr.checkIns?.[0];
      return {
        id: kr.id,
        title: kr.title,
        objectiveId: objective.id,
        objectiveTitle: objective.title,
        objectiveStatus: objective.status ?? "active",
        driUserId: kr.driUser?.id ?? null,
        driUser: kr.driUser ?? null,
        currentValue: kr.currentValue,
        targetValue: kr.targetValue,
        startValue: kr.startValue,
        unit: kr.unit,
        unitLabel: kr.unitLabel,
        progress: Math.round(krProgress(kr) * 100),
        effectiveStatus: status,
        confidence: statusToConfidence(status),
        lastCheckInAt: latestCheckIn ? new Date(latestCheckIn.createdAt) : null,
        period: kr.period,
      };
    }),
  );
}

/** Unit-aware value label: "40%", "$1,200", "12h", "7 deals", "7". */
export function formatKrValue(
  value: number,
  unit: string | undefined,
  unitLabel: string | null | undefined,
): string {
  if (unit === "percent") return `${Math.round(value)}%`;
  if (unit === "currency")
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (unit === "hours") return `${value.toLocaleString()}h`;
  if (unit === "custom" && unitLabel) return `${value.toLocaleString()} ${unitLabel}`;
  return value.toLocaleString();
}

export type KeyResultSortField =
  | "title"
  | "objective"
  | "owner"
  | "progress"
  | "status"
  | "lastCheckIn";

export interface KeyResultSort {
  field: KeyResultSortField;
  direction: "asc" | "desc";
}

/** Status sorts worst-first when ascending: off track, at risk, not started, on track. */
const CONFIDENCE_RANK: Record<Confidence, number> = { bad: 0, warn: 1, idle: 2, ok: 3 };

/** The default direction when a column is first chosen. */
export function defaultSortDirection(field: KeyResultSortField): "asc" | "desc" {
  // Numbers and dates read best biggest / latest first; names alphabetically.
  return field === "progress" || field === "lastCheckIn" ? "desc" : "asc";
}

/**
 * Stable client-side sort. Ties (and rows with no owner / no check-in, which
 * always sink to the end whatever the direction) fall back to title, then
 * id, so the order never depends on the payload's order.
 */
export function sortKeyResultRows(
  rows: KeyResultRowData[],
  sort: KeyResultSort | null,
): KeyResultRowData[] {
  if (!sort) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  const collate = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base" });
  const tieBreak = (a: KeyResultRowData, b: KeyResultRowData) =>
    collate(a.title, b.title) || collate(a.id, b.id);

  const compare = (a: KeyResultRowData, b: KeyResultRowData): number => {
    switch (sort.field) {
      case "title":
        return collate(a.title, b.title) * dir;
      case "objective":
        return collate(a.objectiveTitle, b.objectiveTitle) * dir;
      case "owner": {
        const an = a.driUser?.name ?? a.driUser?.email ?? null;
        const bn = b.driUser?.name ?? b.driUser?.email ?? null;
        if (an === null || bn === null) return an === bn ? 0 : an === null ? 1 : -1;
        return collate(an, bn) * dir;
      }
      case "progress":
        return (a.progress - b.progress) * dir;
      case "status":
        return (CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]) * dir;
      case "lastCheckIn": {
        const at = a.lastCheckInAt?.getTime() ?? null;
        const bt = b.lastCheckInAt?.getTime() ?? null;
        if (at === null || bt === null) return at === bt ? 0 : at === null ? 1 : -1;
        return (at - bt) * dir;
      }
    }
  };

  return [...rows].sort((a, b) => compare(a, b) || tieBreak(a, b));
}

const CONFIDENCE_TO_HEALTH: Record<Confidence, HealthFilterValue> = {
  ok: "on-track",
  warn: "at-risk",
  bad: "off-track",
  idle: "no-update",
};

/**
 * The Goals page filters, read against key result rows. The URL params are
 * shared with the other views, so each keeps its meaning: Status is the
 * parent objective's lifecycle (a completed objective's KRs go with it),
 * Health is the key result's own effective-status bucket (the same four
 * values the objective badge uses), Owner is the key result's DRI, and
 * search matches the key result or its objective by title.
 */
export function filterKeyResultRows(
  rows: KeyResultRowData[],
  filters: FilterState,
  searchQuery: string,
): KeyResultRowData[] {
  const q = searchQuery.trim().toLowerCase();
  const status = filters.status as string[] | undefined;
  const health = filters.health as string[] | undefined;
  const dri = filters.driId as string[] | undefined;
  return rows.filter((r) => {
    if (status && status.length > 0 && !status.includes(r.objectiveStatus)) return false;
    if (health && health.length > 0 && !health.includes(CONFIDENCE_TO_HEALTH[r.confidence])) {
      return false;
    }
    if (dri && dri.length > 0) {
      if (!r.driUserId || !dri.includes(r.driUserId)) return false;
    }
    if (q) {
      const haystack = `${r.title} ${r.objectiveTitle}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
