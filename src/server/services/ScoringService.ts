import { type PrismaClient } from "@prisma/client";
import { startOfDay, endOfDay, subDays, differenceInDays } from "date-fns";
import { type Context } from "~/server/auth/types";

// Types
export interface DailyScoreBreakdown {
  planCreated: number;
  planCompleted: number;
  taskCompletion: number;
  habitCompletion: number;
  schedulingBonus: number;
  inboxBonus: number;
  estimationBonus: number;
  weeklyReviewBonus: number;
}

export interface DailyScoreResult {
  id: string;
  date: Date;
  totalScore: number;
  breakdown: DailyScoreBreakdown;
  metadata: {
    totalPlannedTasks: number;
    completedTasks: number;
    scheduledHabits: number;
    completedHabits: number;
    estimationAccuracy: number | null;
  };
}

export interface ProductivityStats {
  today: number;
  week: number; // 7-day average
  month: number; // 30-day average
  allTime: number;
  totalDays: number;
  qualifiedDays: number; // Days with >= 60 points
  consistency: number; // % of qualified days
}

/**
 * ScoringService handles all daily productivity scoring logic.
 * Scoring emphasizes daily planning consistency (40 points) over perfect execution.
 * Qualified day threshold: 60 points minimum for streak counting.
 */
export class ScoringService {
  private static readonly QUALIFIED_SCORE_THRESHOLD = 60;

  /**
   * Calculate or recalculate daily score for a specific date
   */
  static async calculateDailyScore(
    ctx: Context,
    date: Date,
    workspaceId?: string
  ): Promise<DailyScoreResult> {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error("User not authenticated");

    const normalizedDate = startOfDay(date);

    // Get the daily plan for this date
    const dailyPlan = await ctx.db.dailyPlan.findFirst({
      where: {
        userId,
        date: normalizedDate,
        workspaceId: workspaceId ?? null,
      },
      include: {
        plannedActions: true,
      },
    });

    // Initialize score components
    let planCreated = 0;
    let planCompleted = 0;
    let taskCompletion = 0;
    let habitCompletion = 0;
    let schedulingBonus = 0;
    let inboxBonus = 0;
    let estimationBonus = 0;
    const weeklyReviewBonus = 0; // Set by weekly review completion separately

    let totalPlannedTasks = 0;
    let completedTasks = 0;
    let scheduledHabits = 0;
    let completedHabits = 0;
    let estimationAccuracy: number | null = null;

    // 1. Planning Consistency (40 points)
    if (dailyPlan) {
      planCreated = 20; // Plan was created
      if (dailyPlan.status === "COMPLETED") {
        planCompleted = 20; // Plan was finalized
      }

      // 2. Task Execution (25 points)
      totalPlannedTasks = dailyPlan.plannedActions.length;
      if (totalPlannedTasks > 0) {
        completedTasks = dailyPlan.plannedActions.filter(
          (action) => action.completed
        ).length;
        const completionRate = completedTasks / totalPlannedTasks;
        taskCompletion = Math.round(completionRate * 25);
      }

      // 3. Scheduling Adherence Bonus (5 points)
      const hasAutoScheduledTasks = dailyPlan.plannedActions.some(
        (action) =>
          action.schedulingMethod === "auto-suggested" && action.completed
      );
      if (hasAutoScheduledTasks) {
        schedulingBonus = 5;
      }

      // 4. Inbox Processing Bonus (5 points)
      if (dailyPlan.processedOverdue) {
        inboxBonus = 5;
      }

      // 5. Estimation Accuracy Bonus (5 points)
      if (dailyPlan.estimationAccuracy !== null) {
        estimationAccuracy = dailyPlan.estimationAccuracy;
        if (estimationAccuracy >= 80) {
          estimationBonus = 5;
        }
      }
    }

    // 6. Habit Completion (20 points)
    const habitData = await this.getScheduledHabitsForDay(
      ctx.db,
      userId,
      normalizedDate
    );
    scheduledHabits = habitData.scheduled;
    completedHabits = habitData.completed;

    if (scheduledHabits > 0) {
      const habitRate = completedHabits / scheduledHabits;
      habitCompletion = Math.round(habitRate * 20);
    }

    // Calculate total score (max 100)
    const totalScore = Math.min(
      planCreated +
        planCompleted +
        taskCompletion +
        habitCompletion +
        schedulingBonus +
        inboxBonus +
        estimationBonus +
        weeklyReviewBonus,
      100
    );

    // Find existing score or create new one
    // Note: Using findFirst + create/update instead of upsert because
    // Prisma doesn't handle null values in composite unique keys reliably
    const scoreData = {
      totalScore,
      planCreated,
      planCompleted,
      taskCompletion,
      habitCompletion,
      schedulingBonus,
      inboxBonus,
      estimationBonus,
      weeklyReviewBonus,
      totalPlannedTasks,
      completedTasks,
      scheduledHabits,
      completedHabits,
      estimationAccuracy,
      processedOverdue: dailyPlan?.processedOverdue ?? false,
    };

    const existingScore = await ctx.db.dailyScore.findFirst({
      where: {
        userId,
        date: normalizedDate,
        workspaceId: workspaceId ?? null,
      },
    });

    let dailyScore;
    if (existingScore) {
      dailyScore = await ctx.db.dailyScore.update({
        where: { id: existingScore.id },
        data: {
          ...scoreData,
          calculatedAt: new Date(),
        },
      });
    } else {
      dailyScore = await ctx.db.dailyScore.create({
        data: {
          userId,
          workspaceId: workspaceId ?? null,
          date: normalizedDate,
          ...scoreData,
        },
      });
    }

    // Update daily planning streak if qualified
    if (totalScore >= this.QUALIFIED_SCORE_THRESHOLD) {
      await this.updateDailyPlanningStreak(
        ctx,
        normalizedDate,
        totalScore,
        workspaceId
      );
    }

    return {
      id: dailyScore.id,
      date: dailyScore.date,
      totalScore: dailyScore.totalScore,
      breakdown: {
        planCreated: dailyScore.planCreated,
        planCompleted: dailyScore.planCompleted,
        taskCompletion: dailyScore.taskCompletion,
        habitCompletion: dailyScore.habitCompletion,
        schedulingBonus: dailyScore.schedulingBonus,
        inboxBonus: dailyScore.inboxBonus,
        estimationBonus: dailyScore.estimationBonus,
        weeklyReviewBonus: dailyScore.weeklyReviewBonus,
      },
      metadata: {
        totalPlannedTasks: dailyScore.totalPlannedTasks,
        completedTasks: dailyScore.completedTasks,
        scheduledHabits: dailyScore.scheduledHabits,
        completedHabits: dailyScore.completedHabits,
        estimationAccuracy: dailyScore.estimationAccuracy,
      },
    };
  }

  /**
   * Get score history for a date range
   */
  static async getScoreRange(
    ctx: Context,
    startDate: Date,
    endDate: Date,
    workspaceId?: string
  ): Promise<DailyScoreResult[]> {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error("User not authenticated");

    const scores = await ctx.db.dailyScore.findMany({
      where: {
        userId,
        workspaceId: workspaceId ?? null,
        date: {
          gte: startOfDay(startDate),
          lte: endOfDay(endDate),
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    return scores.map((score) => ({
      id: score.id,
      date: score.date,
      totalScore: score.totalScore,
      breakdown: {
        planCreated: score.planCreated,
        planCompleted: score.planCompleted,
        taskCompletion: score.taskCompletion,
        habitCompletion: score.habitCompletion,
        schedulingBonus: score.schedulingBonus,
        inboxBonus: score.inboxBonus,
        estimationBonus: score.estimationBonus,
        weeklyReviewBonus: score.weeklyReviewBonus,
      },
      metadata: {
        totalPlannedTasks: score.totalPlannedTasks,
        completedTasks: score.completedTasks,
        scheduledHabits: score.scheduledHabits,
        completedHabits: score.completedHabits,
        estimationAccuracy: score.estimationAccuracy,
      },
    }));
  }

  /**
   * Get productivity statistics (averages over different timeframes)
   */
  static async getProductivityStats(
    ctx: Context,
    workspaceId?: string
  ): Promise<ProductivityStats> {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error("User not authenticated");

    const today = startOfDay(new Date());

    // Get today's score
    const todayScore = await ctx.db.dailyScore.findFirst({
      where: {
        userId,
        workspaceId: workspaceId ?? null,
        date: today,
      },
    });

    // Get last 7 days
    const last7Days = await ctx.db.dailyScore.findMany({
      where: {
        userId,
        workspaceId: workspaceId ?? null,
        date: {
          gte: subDays(today, 6),
          lte: today,
        },
      },
    });

    // Get last 30 days
    const last30Days = await ctx.db.dailyScore.findMany({
      where: {
        userId,
        workspaceId: workspaceId ?? null,
        date: {
          gte: subDays(today, 29),
          lte: today,
        },
      },
    });

    // Get all-time scores
    const allTimeScores = await ctx.db.dailyScore.findMany({
      where: {
        userId,
        workspaceId: workspaceId ?? null,
      },
    });

    // Calculate averages
    const weekAvg =
      last7Days.length > 0
        ? Math.round(
            last7Days.reduce((sum, s) => sum + s.totalScore, 0) /
              last7Days.length
          )
        : 0;

    const monthAvg =
      last30Days.length > 0
        ? Math.round(
            last30Days.reduce((sum, s) => sum + s.totalScore, 0) /
              last30Days.length
          )
        : 0;

    const allTimeAvg =
      allTimeScores.length > 0
        ? Math.round(
            allTimeScores.reduce((sum, s) => sum + s.totalScore, 0) /
              allTimeScores.length
          )
        : 0;

    // Calculate qualified days (>= 60 points)
    const qualifiedDays = allTimeScores.filter(
      (s) => s.totalScore >= this.QUALIFIED_SCORE_THRESHOLD
    ).length;

    const consistency =
      allTimeScores.length > 0
        ? Math.round((qualifiedDays / allTimeScores.length) * 100)
        : 0;

    return {
      today: todayScore?.totalScore ?? 0,
      week: weekAvg,
      month: monthAvg,
      allTime: allTimeAvg,
      totalDays: allTimeScores.length,
      qualifiedDays,
      consistency,
    };
  }

  /**
   * Update daily planning streak for a user
   */
  static async updateDailyPlanningStreak(
    ctx: Context,
    date: Date,
    _score: number,
    workspaceId?: string
  ): Promise<void> {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error("User not authenticated");

    const normalizedDate = startOfDay(date);

    // Find existing streak using findFirst (nullable workspaceId)
    const existingStreak = await ctx.db.productivityStreak.findFirst({
      where: {
        userId,
        workspaceId: workspaceId ?? null,
        streakType: "daily_planning",
      },
    });

    let currentStreak = 1;
    let longestStreak = 1;

    if (existingStreak) {
      const lastActivityDate = existingStreak.lastActivityDate
        ? startOfDay(existingStreak.lastActivityDate)
        : null;

      if (lastActivityDate) {
        const daysDiff = differenceInDays(normalizedDate, lastActivityDate);

        if (daysDiff === 1) {
          // Consecutive day
          currentStreak = existingStreak.currentStreak + 1;
          longestStreak = Math.max(currentStreak, existingStreak.longestStreak);
        } else if (daysDiff === 0) {
          // Same day update (score changed)
          currentStreak = existingStreak.currentStreak;
          longestStreak = existingStreak.longestStreak;
        } else {
          // Streak broken, restart
          currentStreak = 1;
          longestStreak = existingStreak.longestStreak;
        }
      }
    }

    // Create or update streak record
    if (existingStreak) {
      await ctx.db.productivityStreak.update({
        where: { id: existingStreak.id },
        data: {
          currentStreak,
          longestStreak,
          lastActivityDate: normalizedDate,
        },
      });
    } else {
      await ctx.db.productivityStreak.create({
        data: {
          userId,
          workspaceId: workspaceId ?? null,
          streakType: "daily_planning",
          currentStreak,
          longestStreak,
          lastActivityDate: normalizedDate,
        },
      });
    }
  }

  /**
   * Helper: Get scheduled habits for a specific day with completion count
   */
  static async getScheduledHabitsForDay(
    db: PrismaClient,
    userId: string,
    date: Date
  ): Promise<{ scheduled: number; completed: number }> {
    const normalizedDate = startOfDay(date);
    const dayOfWeek = normalizedDate.getDay(); // 0=Sunday, 6=Saturday

    // Get all active habits for the user
    const habits = await db.habit.findMany({
      where: {
        userId,
        isActive: true,
        startDate: { lte: normalizedDate },
        OR: [{ endDate: null }, { endDate: { gte: normalizedDate } }],
      },
      include: {
        completions: {
          where: {
            completedDate: normalizedDate,
          },
        },
      },
    });

    // Filter habits that should be done today based on frequency
    const scheduledToday = habits.filter((habit) => {
      switch (habit.frequency) {
        case "daily":
          return true;
        case "weekly":
          return dayOfWeek === 0; // Sunday
        case "bi_weekly": {
          const weeksSinceStart = Math.floor(
            differenceInDays(normalizedDate, habit.startDate) / 7
          );
          return weeksSinceStart % 2 === 0 && dayOfWeek === 0;
        }
        case "monthly":
          return normalizedDate.getDate() === 1;
        case "3x_week":
        case "custom":
          return habit.daysOfWeek.includes(dayOfWeek);
        default:
          return true;
      }
    });

    const scheduled = scheduledToday.length;
    const completed = scheduledToday.filter(
      (habit) => habit.completions.length > 0
    ).length;

    return { scheduled, completed };
  }

  /**
   * Apply weekly review bonus to all days in a week
   */
  static async applyWeeklyReviewBonus(
    ctx: Context,
    weekStartDate: Date,
    workspaceId?: string
  ): Promise<void> {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error("User not authenticated");

    const normalizedWeekStart = startOfDay(weekStartDate);
    const bonusPerDay = 1.43; // Distribute 10 points across 7 days

    // Get all 7 days of the week
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(normalizedWeekStart.getTime() + i * 24 * 60 * 60 * 1000));
    }

    // Update each day's score
    for (const day of days) {
      const dailyScore = await ctx.db.dailyScore.findFirst({
        where: {
          userId,
          workspaceId: workspaceId ?? null,
          date: startOfDay(day),
        },
      });

      if (dailyScore) {
        const newWeeklyReviewBonus = Math.round(
          dailyScore.weeklyReviewBonus + bonusPerDay
        );
        const newTotalScore = Math.min(
          dailyScore.totalScore + Math.round(bonusPerDay),
          100
        );

        await ctx.db.dailyScore.update({
          where: { id: dailyScore.id },
          data: {
            weeklyReviewBonus: newWeeklyReviewBonus,
            totalScore: newTotalScore,
          },
        });
      }
    }
  }
}
