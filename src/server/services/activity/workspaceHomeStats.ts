import type { PrismaClient } from "@prisma/client";
import { addWeeks, endOfISOWeek, startOfISOWeek } from "date-fns";

/**
 * Aggregated metrics that power the Activity dashboard Hero strip. Composed
 * from `DailyScore` (this week / last week task totals), `ProductivityStreak`
 * (longest active streak for the user), and `Project` (count of active
 * projects in the workspace).
 *
 * The hero week-over-week delta is `thisWeekTotal - lastWeekTotal`. The
 * sparkline payload is intentionally left as `null` for this slice — the
 * 7-day breakdown is wired in slice 6 (Week-in-Review with real data).
 */
export interface WorkspaceHomeStats {
  thisWeek: {
    completed: number;
    planned: number;
  };
  lastWeek: {
    completed: number;
    planned: number;
  };
  /** Difference `thisWeek.completed - lastWeek.completed`. Negative means a drop. */
  deltaCompleted: number;
  /** Current day-streak for the user in this workspace. */
  streakDays: number;
  /** Projects with `status = "ACTIVE"` in the workspace. */
  activeProjectCount: number;
  /** 7-day per-day completion totals. Always `null` in this slice — wired in slice 6. */
  weekDaily: null;
}

export async function getWorkspaceHomeStats(
  db: PrismaClient,
  args: { workspaceId: string; userId: string; now?: Date },
): Promise<WorkspaceHomeStats> {
  const now = args.now ?? new Date();
  const thisWeekStart = startOfISOWeek(now);
  const thisWeekEnd = endOfISOWeek(now);
  const lastWeekStart = startOfISOWeek(addWeeks(now, -1));
  const lastWeekEnd = endOfISOWeek(addWeeks(now, -1));

  const [thisWeekRows, lastWeekRows, streak, activeProjectCount] = await Promise.all([
    db.dailyScore.findMany({
      where: {
        userId: args.userId,
        workspaceId: args.workspaceId,
        date: { gte: thisWeekStart, lte: thisWeekEnd },
      },
      select: { completedTasks: true, totalPlannedTasks: true },
    }),
    db.dailyScore.findMany({
      where: {
        userId: args.userId,
        workspaceId: args.workspaceId,
        date: { gte: lastWeekStart, lte: lastWeekEnd },
      },
      select: { completedTasks: true, totalPlannedTasks: true },
    }),
    db.productivityStreak.findFirst({
      where: { userId: args.userId, workspaceId: args.workspaceId },
      orderBy: { currentStreak: "desc" },
      select: { currentStreak: true },
    }),
    db.project.count({
      where: { workspaceId: args.workspaceId, status: "ACTIVE" },
    }),
  ]);

  const sumCompleted = (rows: Array<{ completedTasks: number }>) =>
    rows.reduce((acc, row) => acc + row.completedTasks, 0);
  const sumPlanned = (rows: Array<{ totalPlannedTasks: number }>) =>
    rows.reduce((acc, row) => acc + row.totalPlannedTasks, 0);

  const thisWeekCompleted = sumCompleted(thisWeekRows);
  const lastWeekCompleted = sumCompleted(lastWeekRows);

  return {
    thisWeek: {
      completed: thisWeekCompleted,
      planned: sumPlanned(thisWeekRows),
    },
    lastWeek: {
      completed: lastWeekCompleted,
      planned: sumPlanned(lastWeekRows),
    },
    deltaCompleted: thisWeekCompleted - lastWeekCompleted,
    streakDays: streak?.currentStreak ?? 0,
    activeProjectCount,
    weekDaily: null,
  };
}
