import type { PrismaClient } from "@prisma/client";
import { addWeeks, endOfISOWeek, startOfISOWeek } from "date-fns";

/**
 * One bar of the Week-in-Review sparkline. `day` is the ISO weekday label
 * (Mon..Sun) emitted in the user's locale-free short form so the component
 * can render it directly without re-formatting.
 */
export interface WeeklySparklineBar {
  /** "Mon" … "Sun". */
  day: string;
  /** Number of `WorkspaceActivityEvent` rows on that day. */
  count: number;
  /** True for the bar representing "today". */
  isToday: boolean;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * Aggregated metrics that power the Activity dashboard Hero strip and
 * Week-in-Review card. Composed from `DailyScore` (this week / last week
 * task totals), `ProductivityStreak` (current streak), `Project` (active
 * count), and `WorkspaceActivityEvent` (daily activity rollups for the
 * sparkline + multi-week stats).
 *
 * The hero week-over-week delta is `thisWeek.completed - lastWeek.completed`.
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
  /**
   * 7-day sparkline for the **current** ISO week (Mon → Sun) showing event
   * counts per day. Wired in slice T6; reads from `WorkspaceActivityEvent`.
   */
  weeklySparkline: WeeklySparklineBar[];
  /** Total events for last ISO week (Mon → Sun). */
  lastWeekTotal: number;
  /** Mean events per ISO week across the last 4 completed weeks. */
  fourWeekAvg: number;
  /** Highest single-ISO-week event total in the trailing 12 ISO weeks. */
  bestWeekTotal: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
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

  // For multi-week stats: query the last 12 ISO weeks of activity events so
  // we can compute lastWeekTotal, fourWeekAvg, and bestWeekTotal from one
  // round-trip rather than 12 separate findMany calls.
  const twelveWeeksAgoStart = startOfISOWeek(addWeeks(now, -11));

  const [
    thisWeekRows,
    lastWeekRows,
    streak,
    activeProjectCount,
    activityRows,
  ] = await Promise.all([
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
    db.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*)::bigint AS count
      FROM "WorkspaceActivityEvent"
      WHERE "workspaceId" = ${args.workspaceId}
        AND "createdAt" >= ${twelveWeeksAgoStart}
        AND "createdAt" <= ${thisWeekEnd}
      GROUP BY day
    `,
  ]);

  const sumCompleted = (rows: Array<{ completedTasks: number }>) =>
    rows.reduce((acc, row) => acc + row.completedTasks, 0);
  const sumPlanned = (rows: Array<{ totalPlannedTasks: number }>) =>
    rows.reduce((acc, row) => acc + row.totalPlannedTasks, 0);

  const thisWeekCompleted = sumCompleted(thisWeekRows);
  const lastWeekCompleted = sumCompleted(lastWeekRows);

  // ── Bucket activity rows by day ────────────────────────────────────
  const countsByDay = new Map<string, number>();
  for (const row of activityRows) {
    const key = row.day.toISOString().slice(0, 10);
    countsByDay.set(key, Number(row.count));
  }

  // ── This-week sparkline (Mon → Sun) ────────────────────────────────
  const sparkline: WeeklySparklineBar[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(thisWeekStart.getTime() + i * MS_PER_DAY);
    const key = day.toISOString().slice(0, 10);
    sparkline.push({
      day: DAY_LABELS[i] ?? "?",
      count: countsByDay.get(key) ?? 0,
      isToday: isSameDay(day, now),
    });
  }

  // ── Multi-week aggregates ──────────────────────────────────────────
  // Walk back 12 weeks; sum per-week totals; take last 4 for the average
  // and the max across all 12 for the best-week.
  const weekTotals: number[] = [];
  for (let w = 0; w < 12; w++) {
    const weekStart = startOfISOWeek(addWeeks(now, -w));
    let total = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart.getTime() + d * MS_PER_DAY);
      total += countsByDay.get(day.toISOString().slice(0, 10)) ?? 0;
    }
    weekTotals.push(total);
  }
  // weekTotals[0] is current week, [1] is last week, …, [11] is 11 weeks ago.
  const lastWeekTotal = weekTotals[1] ?? 0;
  // 4-week average uses the last 4 completed weeks (index 1..4).
  const fourWeekWindow = weekTotals.slice(1, 5);
  const fourWeekAvg =
    fourWeekWindow.length === 0
      ? 0
      : Math.round(
          fourWeekWindow.reduce((acc, n) => acc + n, 0) /
            fourWeekWindow.length,
        );
  const bestWeekTotal = weekTotals.length === 0 ? 0 : Math.max(...weekTotals);

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
    weeklySparkline: sparkline,
    lastWeekTotal,
    fourWeekAvg,
    bestWeekTotal,
  };
}
