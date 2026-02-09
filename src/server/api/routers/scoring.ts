import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { ScoringService } from "~/server/services/ScoringService";
import { startOfDay, subDays } from "date-fns";

export const scoringRouter = createTRPCRouter({
  /**
   * Get today's score (or create it if doesn't exist)
   */
  getTodayScore: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
          date: z.date().optional(), // Optional: get score for specific date
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const targetDate = input?.date ?? new Date();
      return await ScoringService.calculateDailyScore(
        ctx,
        startOfDay(targetDate),
        input?.workspaceId
      );
    }),

  /**
   * Get score history for a date range
   */
  getScoreHistory: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        workspaceId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await ScoringService.getScoreRange(
        ctx,
        input.startDate,
        input.endDate,
        input.workspaceId
      );
    }),

  /**
   * Get last 30 days of scores (for chart)
   */
  getLast30Days: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const today = startOfDay(new Date());
      const thirtyDaysAgo = subDays(today, 29);

      return await ScoringService.getScoreRange(
        ctx,
        thirtyDaysAgo,
        today,
        input?.workspaceId
      );
    }),

  /**
   * Get productivity statistics (averages)
   */
  getProductivityStats: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return await ScoringService.getProductivityStats(
        ctx,
        input?.workspaceId
      );
    }),

  /**
   * Get all streaks for the user
   */
  getStreaks: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return await ctx.db.productivityStreak.findMany({
        where: {
          userId,
          workspaceId: input?.workspaceId ?? null,
        },
      });
    }),

  /**
   * Get specific streak by type
   */
  getStreakByType: protectedProcedure
    .input(
      z.object({
        streakType: z.enum(["daily_planning", "habits", "weekly_review"]),
        workspaceId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return await ctx.db.productivityStreak.findUnique({
        where: {
          userId_workspaceId_streakType: {
            userId,
            workspaceId: input.workspaceId ?? null,
            streakType: input.streakType,
          },
        },
      });
    }),

  /**
   * Recalculate score for a specific date (admin/debug)
   */
  recalculateScore: protectedProcedure
    .input(
      z.object({
        date: z.date(),
        workspaceId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ScoringService.calculateDailyScore(
        ctx,
        startOfDay(input.date),
        input.workspaceId
      );
    }),
});
