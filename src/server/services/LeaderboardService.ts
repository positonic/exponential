import { type PrismaClient } from "@prisma/client";
import { startOfDay, subDays } from "date-fns";
import { type Context } from "~/server/auth/types";

// Types
export interface LeaderboardEntryData {
  rank: number;
  userId: string;
  userName: string;
  userImage: string | null;
  score: number;
  streak: number;
  trend: "up" | "down" | "stable";
  totalDays: number;
  consistency: number; // % qualified days
  isCurrentUser?: boolean;
}

export interface LeaderboardResponse {
  timeframe: string;
  entries: LeaderboardEntryData[];
  userRank: number | null;
  userEntry: LeaderboardEntryData | null;
  totalParticipants: number;
}

/**
 * LeaderboardService handles leaderboard calculations, rankings, and user preferences.
 * Supports opt-in participation with anonymous mode.
 */
export class LeaderboardService {
  private static readonly QUALIFIED_SCORE_THRESHOLD = 60;

  /**
   * Get leaderboard for a specific timeframe
   */
  static async getLeaderboard(
    ctx: Context,
    timeframe: "today" | "week" | "month" | "all_time",
    workspaceId?: string,
    limit = 50
  ): Promise<LeaderboardResponse> {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error("User not authenticated");

    const today = startOfDay(new Date());

    // Determine date range based on timeframe
    let startDate: Date;
    switch (timeframe) {
      case "today":
        startDate = today;
        break;
      case "week":
        startDate = subDays(today, 6); // Last 7 days
        break;
      case "month":
        startDate = subDays(today, 29); // Last 30 days
        break;
      case "all_time":
        startDate = new Date(0); // Beginning of time
        break;
    }

    // Get all opted-in users with their scores
    const optedInUsers = await ctx.db.user.findMany({
      where: {
        leaderboardOptIn: true,
        ...(workspaceId
          ? { leaderboardWorkspaceIds: { has: workspaceId } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        image: true,
        leaderboardAnonymous: true,
        dailyScores: {
          where: {
            date: { gte: startDate, lte: today },
            workspaceId: workspaceId ?? null,
          },
          orderBy: { date: "desc" },
        },
        streaks: {
          where: {
            streakType: "daily_planning",
            workspaceId: workspaceId ?? null,
          },
        },
      },
    });

    // Calculate average scores for each user
    const userScores = optedInUsers
      .map((user) => {
        const scores = user.dailyScores;
        if (scores.length === 0) return null;

        const totalScore = scores.reduce((sum, s) => sum + s.totalScore, 0);
        const firstScore = scores[0];
        const avgScore =
          timeframe === "today" && firstScore
            ? firstScore.totalScore
            : Math.round(totalScore / scores.length);

        const qualifiedDays = scores.filter(
          (s) => s.totalScore >= this.QUALIFIED_SCORE_THRESHOLD
        ).length;
        const consistency =
          scores.length > 0
            ? Math.round((qualifiedDays / scores.length) * 100)
            : 0;

        const streak = user.streaks[0]?.currentStreak ?? 0;

        // Calculate trend (compare first half vs second half of period)
        let trend: "up" | "down" | "stable" = "stable";
        if (scores.length >= 4) {
          const halfPoint = Math.floor(scores.length / 2);
          const recentHalf = scores.slice(0, halfPoint);
          const olderHalf = scores.slice(halfPoint);

          const recentAvg =
            recentHalf.reduce((sum, s) => sum + s.totalScore, 0) /
            recentHalf.length;
          const olderAvg =
            olderHalf.reduce((sum, s) => sum + s.totalScore, 0) /
            olderHalf.length;

          if (recentAvg > olderAvg + 5) trend = "up";
          else if (recentAvg < olderAvg - 5) trend = "down";
        }

        return {
          userId: user.id,
          userName: user.leaderboardAnonymous
            ? "Anonymous User"
            : user.name ?? "Unknown User",
          userImage: user.leaderboardAnonymous ? null : user.image,
          score: avgScore,
          streak,
          trend,
          totalDays: scores.length,
          consistency,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Sort by score (descending) and assign ranks
    userScores.sort((a, b) => b.score - a.score);

    const entries: LeaderboardEntryData[] = userScores
      .slice(0, limit)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
        isCurrentUser: entry.userId === userId,
      }));

    // Find current user's rank and entry
    const userRankIndex = userScores.findIndex((u) => u.userId === userId);
    const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null;
    const userEntry = userRankIndex >= 0 ? userScores[userRankIndex] : null;

    return {
      timeframe,
      entries,
      userRank,
      userEntry: userEntry
        ? {
            ...userEntry,
            rank: userRank!,
            isCurrentUser: true,
          }
        : null,
      totalParticipants: userScores.length,
    };
  }

  /**
   * Get user's rank for a specific timeframe
   */
  static async getUserRank(
    ctx: Context,
    timeframe: "today" | "week" | "month" | "all_time",
    workspaceId?: string
  ): Promise<{ rank: number; totalParticipants: number } | null> {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error("User not authenticated");

    const leaderboard = await this.getLeaderboard(
      ctx,
      timeframe,
      workspaceId,
      999999 // Get all to calculate rank
    );

    if (leaderboard.userRank === null) return null;

    return {
      rank: leaderboard.userRank,
      totalParticipants: leaderboard.totalParticipants,
    };
  }

  /**
   * Update user's leaderboard preferences
   */
  static async updatePreferences(
    ctx: Context,
    optIn: boolean,
    anonymous: boolean,
    workspaceIds?: string[]
  ): Promise<void> {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error("User not authenticated");

    await ctx.db.user.update({
      where: { id: userId },
      data: {
        leaderboardOptIn: optIn,
        leaderboardAnonymous: anonymous,
        ...(workspaceIds !== undefined
          ? { leaderboardWorkspaceIds: workspaceIds }
          : {}),
      },
    });
  }

  /**
   * Refresh leaderboard cache (for batch jobs)
   * This pre-calculates and stores LeaderboardEntry records for fast queries
   */
  static async refreshLeaderboardCache(
    db: PrismaClient,
    timeframe: "today" | "week" | "month" | "all_time",
    workspaceId?: string
  ): Promise<void> {
    const today = startOfDay(new Date());

    // Determine date range
    let startDate: Date;
    switch (timeframe) {
      case "today":
        startDate = today;
        break;
      case "week":
        startDate = subDays(today, 6);
        break;
      case "month":
        startDate = subDays(today, 29);
        break;
      case "all_time":
        startDate = new Date(0);
        break;
    }

    // Get all opted-in users
    const optedInUsers = await db.user.findMany({
      where: {
        leaderboardOptIn: true,
        ...(workspaceId
          ? { leaderboardWorkspaceIds: { has: workspaceId } }
          : {}),
      },
      select: {
        id: true,
        dailyScores: {
          where: {
            date: { gte: startDate, lte: today },
            workspaceId: workspaceId ?? null,
          },
        },
      },
    });

    // Calculate scores
    const userScores = optedInUsers
      .map((user) => {
        const scores = user.dailyScores;
        if (scores.length === 0) return null;

        const totalScore = scores.reduce((sum, s) => sum + s.totalScore, 0);
        const firstScore = scores[0];
        const avgScore =
          timeframe === "today" && firstScore
            ? firstScore.totalScore
            : Math.round(totalScore / scores.length);

        const qualifiedDays = scores.filter(
          (s) => s.totalScore >= this.QUALIFIED_SCORE_THRESHOLD
        ).length;
        const consistency =
          scores.length > 0
            ? Math.round((qualifiedDays / scores.length) * 100)
            : 0;

        return {
          userId: user.id,
          score: avgScore,
          totalDays: scores.length,
          consistency,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Sort and assign ranks
    userScores.sort((a, b) => b.score - a.score);

    // Create or update LeaderboardEntry records
    for (let i = 0; i < userScores.length; i++) {
      const entry = userScores[i]!;
      const rank = i + 1;
      const percentile =
        userScores.length > 1
          ? Math.round(((userScores.length - rank) / userScores.length) * 100)
          : 100;

      const existingEntry = await db.leaderboardEntry.findFirst({
        where: {
          userId: entry.userId,
          workspaceId: workspaceId ?? null,
          period: timeframe,
        },
      });

      if (existingEntry) {
        await db.leaderboardEntry.update({
          where: { id: existingEntry.id },
          data: {
            score: entry.score,
            rank,
            percentile,
            totalDays: entry.totalDays,
            consistency: entry.consistency,
          },
        });
      } else {
        await db.leaderboardEntry.create({
          data: {
            userId: entry.userId,
            workspaceId: workspaceId ?? null,
            period: timeframe,
            score: entry.score,
            rank,
            percentile,
            totalDays: entry.totalDays,
            consistency: entry.consistency,
          },
        });
      }
    }
  }
}
