import type { PrismaClient } from "@prisma/client";
import { getSundayWeekStart } from "~/lib/weekUtils";

/**
 * Effective goal health = manual override, else cached auto value, else
 * "no-update" (ADR-0004). Narrowed to the four health buckets the UI knows.
 */
export type GoalHealth = "on-track" | "at-risk" | "off-track" | "no-update";

/** One goal the user pinned to focus on this week. */
export interface WorkspaceFocusGoal {
  id: number;
  title: string;
  icon: string | null;
  iconColor: string | null;
  health: GoalHealth;
  /** Mean of this goal's key-result progress (%), or null when it has none. */
  progress: number | null;
}

/**
 * Drives the Activity-home hero "This week's focus" widget. When the user has
 * pinned focus for the current week (via the portfolio weekly review →
 * `WorkspaceWeeklyFocus`), `focusGoals` lists the goals to focus on — rolled up
 * from pinned key results plus any directly-pinned goals. Otherwise the widget
 * falls back to the `glance` summary of active goals for the current period.
 */
export interface WorkspaceFocusSummary {
  hasFocus: boolean;
  focusText: string | null;
  focusGoals: WorkspaceFocusGoal[];
  glance: {
    activeCount: number;
    onTrack: number;
    atRisk: number;
    offTrack: number;
    noUpdate: number;
  };
}

/** Current OKR quarter token, e.g. "Q2-2026". Mirrors portfolioReview. */
function getCurrentQuarter(date: Date): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter}-${date.getUTCFullYear()}`;
}

/** Current OKR annual token, e.g. "Annual-2026". Mirrors portfolioReview. */
function getCurrentAnnual(date: Date): string {
  return `Annual-${date.getUTCFullYear()}`;
}

function effectiveHealth(health: string | null, override: string | null): GoalHealth {
  const value = override ?? health ?? "no-update";
  if (value === "on-track" || value === "at-risk" || value === "off-track") {
    return value;
  }
  return "no-update";
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Mean progress (0–100) across a goal's key results. A KR contributes
 * `(current - start) / (target - start)` clamped to [0,1]; KRs whose target
 * equals their start are skipped (no measurable range). Returns null when the
 * goal has no measurable KRs so the UI can omit the percentage.
 */
function goalProgress(
  keyResults: Array<{ currentValue: number; startValue: number; targetValue: number }>,
): number | null {
  const ratios: number[] = [];
  for (const kr of keyResults) {
    const range = kr.targetValue - kr.startValue;
    if (range === 0) continue;
    ratios.push(clamp01((kr.currentValue - kr.startValue) / range));
  }
  if (ratios.length === 0) return null;
  const mean = ratios.reduce((acc, r) => acc + r, 0) / ratios.length;
  return Math.round(mean * 100);
}

export async function getWorkspaceFocusSummary(
  db: PrismaClient,
  args: { workspaceId: string; userId: string; now?: Date },
): Promise<WorkspaceFocusSummary> {
  const now = args.now ?? new Date();
  const weekStartDate = getSundayWeekStart(now);
  const currentQuarter = getCurrentQuarter(now);
  const currentAnnual = getCurrentAnnual(now);

  const [focus, glanceGoals] = await Promise.all([
    db.workspaceWeeklyFocus.findUnique({
      where: {
        userId_workspaceId_weekStartDate: {
          userId: args.userId,
          workspaceId: args.workspaceId,
          weekStartDate,
        },
      },
      select: { focusText: true, focusGoalIds: true, focusKeyResultIds: true },
    }),
    // At-a-glance fallback: active/planned goals for the current period in this
    // workspace. Mirrors portfolioReview.getReviewData's OKR rollup.
    db.goal.findMany({
      where: {
        workspaceId: args.workspaceId,
        status: { in: ["active", "planned"] },
        OR: [
          { period: currentQuarter },
          { period: currentAnnual },
          { period: null },
        ],
      },
      select: { health: true, healthOverride: true },
    }),
  ]);

  // ── Roll pinned KRs up to their parent goals, union with pinned goals ──
  const goalIdSet = new Set<number>(focus?.focusGoalIds ?? []);
  const krIds = focus?.focusKeyResultIds ?? [];
  if (krIds.length > 0) {
    const krGoals = await db.keyResult.findMany({
      where: { id: { in: krIds } },
      select: { goalId: true },
    });
    for (const kr of krGoals) goalIdSet.add(kr.goalId);
  }

  let focusGoals: WorkspaceFocusGoal[] = [];
  if (goalIdSet.size > 0) {
    const goals = await db.goal.findMany({
      where: { id: { in: [...goalIdSet] }, workspaceId: args.workspaceId },
      select: {
        id: true,
        title: true,
        icon: true,
        iconColor: true,
        health: true,
        healthOverride: true,
        displayOrder: true,
        keyResults: {
          select: { currentValue: true, startValue: true, targetValue: true },
        },
      },
      orderBy: { displayOrder: "asc" },
    });
    focusGoals = goals.map((g) => ({
      id: g.id,
      title: g.title,
      icon: g.icon,
      iconColor: g.iconColor,
      health: effectiveHealth(g.health, g.healthOverride),
      progress: goalProgress(g.keyResults),
    }));
  }

  const glance = glanceGoals.reduce(
    (acc, g) => {
      const h = effectiveHealth(g.health, g.healthOverride);
      if (h === "on-track") acc.onTrack++;
      else if (h === "at-risk") acc.atRisk++;
      else if (h === "off-track") acc.offTrack++;
      else acc.noUpdate++;
      acc.activeCount++;
      return acc;
    },
    { activeCount: 0, onTrack: 0, atRisk: 0, offTrack: 0, noUpdate: 0 },
  );

  return {
    hasFocus: focusGoals.length > 0,
    focusText: focus?.focusText ?? null,
    focusGoals,
    glance,
  };
}
