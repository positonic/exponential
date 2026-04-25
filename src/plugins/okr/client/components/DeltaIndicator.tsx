"use client";

import { Text } from "@mantine/core";

interface KeyResultCheckIn {
  previousValue: number;
  newValue: number;
}

interface KeyResultForDelta {
  currentValue: number;
  targetValue: number;
  startValue: number;
  checkIns?: KeyResultCheckIn[];
}

interface DeltaIndicatorProps {
  delta: number | null;
  size?: "xs" | "sm";
}

/**
 * Calculate progress delta from the most recent check-in.
 * Returns the percentage point change since the last update.
 */
export function calculateDelta(keyResult: KeyResultForDelta): number | null {
  if (!keyResult.checkIns || keyResult.checkIns.length === 0) {
    return null;
  }

  const latestCheckIn = keyResult.checkIns[0];
  if (!latestCheckIn) return null;

  const range = keyResult.targetValue - keyResult.startValue;
  if (range === 0) return 0;

  const currentProgress =
    ((keyResult.currentValue - keyResult.startValue) / range) * 100;
  const previousProgress =
    ((latestCheckIn.previousValue - keyResult.startValue) / range) * 100;

  return Math.round(currentProgress - previousProgress);
}

/**
 * Calculate aggregate delta for an objective from its key results.
 * Returns the average delta across all key results that have check-ins.
 */
export function calculateAggregateDelta(
  keyResults: KeyResultForDelta[]
): number | null {
  const deltas = keyResults
    .map((kr) => calculateDelta(kr))
    .filter((d): d is number => d !== null);

  if (deltas.length === 0) return null;

  return Math.round(deltas.reduce((sum, d) => sum + d, 0) / deltas.length);
}

/**
 * Displays a progress delta indicator (+X% or -X%).
 * Green for positive, red for negative, muted for zero or null.
 */
export function DeltaIndicator({ delta, size = "xs" }: DeltaIndicatorProps) {
  if (delta === null) {
    return (
      <Text size={size} className="w-12 text-right text-text-muted">
        —
      </Text>
    );
  }

  const isPositive = delta > 0;
  const isNegative = delta < 0;

  return (
    <Text
      size={size}
      className={`w-12 text-right font-medium ${
        isPositive
          ? "text-brand-success"
          : isNegative
            ? "text-brand-error"
            : "text-text-muted"
      }`}
    >
      {isPositive && "+"}
      {delta}%
    </Text>
  );
}
