import type {
  ObjectiveCardKeyResult,
  ObjectiveCardObjective,
} from "~/plugins/okr/client/components/ObjectiveCardV2";
import {
  effectiveStatus,
  krProgress,
  statusToConfidence,
  type Confidence,
} from "~/plugins/okr/client/utils/okrDashboardUtils";

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
  objectives: ObjectiveCardObjective[],
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
