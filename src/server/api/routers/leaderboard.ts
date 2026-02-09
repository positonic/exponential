import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { LeaderboardService } from "~/server/services/LeaderboardService";

export const leaderboardRouter = createTRPCRouter({
  /**
   * Get leaderboard for a specific timeframe
   */
  getLeaderboard: protectedProcedure
    .input(
      z.object({
        timeframe: z.enum(["today", "week", "month", "all_time"]),
        workspaceId: z.string().optional(),
        limit: z.number().default(50).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await LeaderboardService.getLeaderboard(
        ctx,
        input.timeframe,
        input.workspaceId,
        input.limit ?? 50
      );
    }),

  /**
   * Get current user's rank for a timeframe
   */
  getMyRank: protectedProcedure
    .input(
      z.object({
        timeframe: z.enum(["today", "week", "month", "all_time"]),
        workspaceId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await LeaderboardService.getUserRank(
        ctx,
        input.timeframe,
        input.workspaceId
      );
    }),

  /**
   * Get user's leaderboard preferences
   */
  getMyPreferences: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: {
        leaderboardOptIn: true,
        leaderboardAnonymous: true,
        leaderboardWorkspaceIds: true,
      },
    });

    return (
      user ?? {
        leaderboardOptIn: false,
        leaderboardAnonymous: false,
        leaderboardWorkspaceIds: [],
      }
    );
  }),

  /**
   * Update user's leaderboard preferences
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        optIn: z.boolean(),
        anonymous: z.boolean().optional(),
        workspaceIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await LeaderboardService.updatePreferences(
        ctx,
        input.optIn,
        input.anonymous ?? false,
        input.workspaceIds
      );

      return { success: true };
    }),

  /**
   * Refresh leaderboard cache (admin/cron job)
   */
  refreshCache: protectedProcedure
    .input(
      z.object({
        timeframe: z.enum(["today", "week", "month", "all_time"]),
        workspaceId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await LeaderboardService.refreshLeaderboardCache(
        ctx.db,
        input.timeframe,
        input.workspaceId
      );

      return { success: true };
    }),
});
