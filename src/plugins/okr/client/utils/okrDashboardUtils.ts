/**
 * Shared helpers for the Dashboard-first OKR view.
 *
 * Covers:
 *   - status → confidence bucket (ok/warn/bad/idle)
 *   - per-KR progress computation (respects startValue/targetValue)
 *   - expected-pace computation from a period string
 *   - weekly trajectory synthesis from check-in history
 */

export type Confidence = "ok" | "warn" | "bad" | "idle";

export interface TrajectoryPoint {
  actual: number;
  expected: number;
}

interface KrForCompute {
  startValue: number;
  currentValue: number;
  targetValue: number;
  status: string;
  checkIns?: Array<{ newValue: number; createdAt: Date | string }>;
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function statusToConfidence(status: string): Confidence {
  switch (status) {
    case "achieved":
    case "on-track":
      return "ok";
    case "at-risk":
      return "warn";
    case "off-track":
      return "bad";
    default:
      return "idle";
  }
}

export function krProgress(kr: KrForCompute): number {
  const range = kr.targetValue - kr.startValue;
  if (range === 0) return 0;
  return clamp01((kr.currentValue - kr.startValue) / range);
}

export function krProgressAt(kr: KrForCompute, at: Date): number {
  const range = kr.targetValue - kr.startValue;
  if (range === 0) return 0;

  const history = (kr.checkIns ?? [])
    .map((c) => ({ value: c.newValue, at: new Date(c.createdAt) }))
    .filter((c) => c.at <= at)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const value = history[0]?.value ?? kr.startValue;
  return clamp01((value - kr.startValue) / range);
}

/**
 * Parse `"Q1-2026" | "Q2-2026" | ... | "Annual-2026" | "H1-2026"` into date range.
 */
export function periodDateRange(period: string): { start: Date; end: Date } | null {
  const match = /^(Q[1-4]|H[12]|Annual)-(\d{4})$/.exec(period);
  if (!match) return null;
  const [, type, yearStr] = match;
  const year = parseInt(yearStr ?? "0", 10);

  switch (type) {
    case "Q1":
      return { start: new Date(year, 0, 1), end: new Date(year, 2, 31) };
    case "Q2":
      return { start: new Date(year, 3, 1), end: new Date(year, 5, 30) };
    case "Q3":
      return { start: new Date(year, 6, 1), end: new Date(year, 8, 30) };
    case "Q4":
      return { start: new Date(year, 9, 1), end: new Date(year, 11, 31) };
    case "H1":
      return { start: new Date(year, 0, 1), end: new Date(year, 5, 30) };
    case "H2":
      return { start: new Date(year, 6, 1), end: new Date(year, 11, 31) };
    case "Annual":
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
    default:
      return null;
  }
}

export function expectedProgress(period: string, now: Date = new Date()): number {
  const range = periodDateRange(period);
  if (!range) return 0;
  const total = range.end.getTime() - range.start.getTime();
  if (total <= 0) return 0;
  const elapsed = now.getTime() - range.start.getTime();
  return clamp01(elapsed / total);
}

/**
 * Format "days left" style label for the period.
 * Returns a short string like "42d left" or "ended 3d ago".
 */
export function periodCountdownLabel(period: string, now: Date = new Date()): string | null {
  const range = periodDateRange(period);
  if (!range) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.round((range.end.getTime() - now.getTime()) / msPerDay);
  if (days < 0) return `ended ${Math.abs(days)}d ago`;
  if (days === 0) return "ends today";
  return `${days}d left`;
}

/**
 * Short "updated X ago" label from a timestamp.
 */
export function relativeTimeLabel(ts: Date | string | null | undefined, now: Date = new Date()): string {
  if (!ts) return "never";
  const d = new Date(ts);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

/**
 * Synthesize a weekly trajectory for the period based on check-in history.
 * Each point is the average KR progress (0..1) at the end of that week,
 * paired with the linearly-expected progress (0..1).
 *
 * If no KRs have check-ins, returns a simple two-point straight line from
 * 0 → current-avg so the UI still has something to render.
 */
export function computeTrajectory(
  krs: KrForCompute[],
  period: string,
  now: Date = new Date()
): TrajectoryPoint[] {
  const range = periodDateRange(period);
  if (!range || krs.length === 0) return [];

  const msPerWeek = 1000 * 60 * 60 * 24 * 7;
  const totalMs = range.end.getTime() - range.start.getTime();
  const weeksInPeriod = Math.max(2, Math.ceil(totalMs / msPerWeek));
  const currentWeekIdx = Math.min(
    weeksInPeriod,
    Math.max(1, Math.ceil((Math.min(now.getTime(), range.end.getTime()) - range.start.getTime()) / msPerWeek)),
  );

  const hasAnyCheckIns = krs.some((k) => (k.checkIns?.length ?? 0) > 0);
  if (!hasAnyCheckIns) {
    const avgNow =
      krs.reduce((acc, kr) => acc + krProgress(kr), 0) / krs.length;
    return [
      { actual: 0, expected: 0 },
      { actual: avgNow, expected: clamp01(currentWeekIdx / weeksInPeriod) },
    ];
  }

  const points: TrajectoryPoint[] = [];
  for (let i = 1; i <= currentWeekIdx; i++) {
    const weekEnd = new Date(range.start.getTime() + i * msPerWeek);
    const avg =
      krs.reduce((acc, kr) => acc + krProgressAt(kr, weekEnd), 0) / krs.length;
    points.push({
      actual: avg,
      expected: clamp01(i / weeksInPeriod),
    });
  }
  return points;
}
