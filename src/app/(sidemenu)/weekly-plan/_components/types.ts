import type { RouterOutputs } from "~/trpc/react";

export type ReviewData = RouterOutputs["portfolioReview"]["getReviewData"];
export type ReviewWorkspace = ReviewData["workspaces"][number];
export type ReviewRollup =
  ReviewData["quarterRollupByWorkspace"][number];
export type ReviewFocus = ReviewData["currentWeekFocuses"][number];

export type Phase = "intro" | "scope" | "okrs" | "projects" | "complete";

export const PHASE_ORDER: Phase[] = [
  "intro",
  "scope",
  "okrs",
  "projects",
  "complete",
];

export const PHASE_META: Record<
  Exclude<Phase, "intro" | "complete">,
  { label: string; title: string; index: number }
> = {
  scope: { label: "Phase 1", title: "Triage workspaces", index: 1 },
  okrs: { label: "Phase 2", title: "Re-rank objectives", index: 2 },
  projects: {
    label: "Phase 3",
    title: "Prioritize projects",
    index: 3,
  },
};

export const COMPLETE_META = {
  label: "Phase 4",
  title: "Drill in",
  index: 4,
};

/**
 * Pick a deterministic glyph color (CSS variable name) for a workspace.
 * Distributes across the 6 palette entries declared in globals.css.
 */
export function workspaceGlyphVar(idx: number): string {
  const slot = (idx % 6) + 1;
  return `var(--pr-ws-${slot})`;
}

export function workspaceShortName(name: string): string {
  const cleaned = name.trim();
  if (cleaned.length === 0) return "??";
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Estimate quarter elapsed % from start/end dates.
 */
export function quarterElapsedPct(
  now: Date,
  quarterStart: Date,
  quarterEnd: Date,
): number {
  const total = quarterEnd.getTime() - quarterStart.getTime();
  const elapsed = now.getTime() - quarterStart.getTime();
  if (total <= 0) return 0;
  const pct = (elapsed / total) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function daysBetween(later: Date, earlier: Date): number {
  return Math.max(
    0,
    Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24)),
  );
}
