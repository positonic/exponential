/**
 * Single source of truth for a goal's progress percentage (0–100).
 *
 * Precedence (decided in exponential-ypa7):
 *   1. Manual `progressOverride` — if set, it wins for ANY goal, including
 *      KR-backed objectives (lets a user correct a misleading auto number).
 *   2. KR-derived mean — when the goal has measurable key results.
 *   3. `null` — no signal; the UI shows "Not started" + a manual input.
 *
 * This is a pure function so it can run on the server (tRPC) and be unit
 * tested without a DB. It deliberately does NOT derive from linked projects;
 * project progress is a manual, frequently-stale field and was excluded.
 */

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export interface KrForProgress {
  currentValue: number;
  startValue: number;
  targetValue: number;
}

export interface GoalForProgress {
  progressOverride?: number | null;
  keyResults: KrForProgress[];
}

/**
 * Mean progress (0–100) across a goal's key results. A KR contributes
 * `(current - start) / (target - start)` clamped to [0,1]; KRs whose target
 * equals their start are skipped (no measurable range). Returns null when the
 * goal has no measurable KRs.
 */
export function keyResultProgress(keyResults: KrForProgress[]): number | null {
  const ratios: number[] = [];
  for (const kr of keyResults) {
    const range = kr.targetValue - kr.startValue;
    if (range === 0) continue;
    ratios.push(clamp((kr.currentValue - kr.startValue) / range, 0, 1));
  }
  if (ratios.length === 0) return null;
  const mean = ratios.reduce((acc, r) => acc + r, 0) / ratios.length;
  return Math.round(mean * 100);
}

/**
 * Resolve the effective progress for a goal following the precedence above.
 * Returns null when there is no manual override and no measurable KRs.
 */
export function resolveGoalProgress(goal: GoalForProgress): number | null {
  if (goal.progressOverride !== null && goal.progressOverride !== undefined) {
    return Math.round(clamp(goal.progressOverride, 0, 100));
  }
  return keyResultProgress(goal.keyResults);
}

/**
 * Whether the resolved progress comes from a manual override rather than KRs.
 * Lets the UI show a hint ("manual · KRs say X%") and a revert-to-auto action.
 */
export function isManualProgress(goal: GoalForProgress): boolean {
  return goal.progressOverride !== null && goal.progressOverride !== undefined;
}
