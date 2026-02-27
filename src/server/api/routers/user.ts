import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const userRouter = createTRPCRouter({
  getCurrentUser: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        id: ctx.session.user.id,
        name: ctx.session.user.name,
        email: ctx.session.user.email,
        image: ctx.session.user.image,
      };
    }),

  getById: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return user;
    }),

  searchByEmail: protectedProcedure
    .input(z.object({
      query: z.string().min(2),
      excludeTeamId: z.string().optional(),
      limit: z.number().min(1).max(20).default(5),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.user.findMany({
        where: {
          OR: [
            { email: { contains: input.query, mode: 'insensitive' } },
            { name: { contains: input.query, mode: 'insensitive' } },
          ],
          id: { not: ctx.session.user.id },
          ...(input.excludeTeamId ? {
            teams: { none: { teamId: input.excludeTeamId } },
          } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
        take: input.limit,
        orderBy: { name: 'asc' },
      });
    }),

  getSelectedTools: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { selectedTools: true },
      });
      return user?.selectedTools ?? [];
    }),

  getWelcomeProgress: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      const [
        user,
        projectCount,
        goalCount,
        outcomeCount,
        projectActionCount,
        calendarAccounts,
        dailyPlanCount,
        completedActionCount,
      ] = await Promise.all([
        ctx.db.user.findUnique({
          where: { id: userId },
          select: {
            name: true,
            welcomeCompletedAt: true,
            usageType: true,
            userRole: true,
          },
        }),
        ctx.db.project.count({ where: { createdById: userId } }),
        ctx.db.goal.count({ where: { userId } }),
        ctx.db.outcome.count({ where: { userId } }),
        ctx.db.action.count({
          where: {
            createdById: userId,
            projectId: { not: null },
            status: { notIn: ['DELETED', 'DRAFT'] },
          },
        }),
        ctx.db.account.findMany({
          where: {
            userId,
            provider: { in: ['google', 'microsoft-entra-id'] },
          },
          select: { provider: true },
        }),
        ctx.db.dailyPlan.count({ where: { userId } }),
        ctx.db.action.count({
          where: { createdById: userId, status: 'COMPLETED' },
        }),
      ]);

      return {
        userName: user?.name ?? null,
        welcomeCompletedAt: user?.welcomeCompletedAt ?? null,
        usageType: user?.usageType ?? null,
        userRole: user?.userRole ?? null,
        steps: {
          hasProject: projectCount > 0,
          hasGoal: goalCount > 0,
          hasOutcome: outcomeCount > 0,
          hasProjectActions: projectActionCount > 0,
          hasCalendar: calendarAccounts.length > 0,
          hasDailyPlan: dailyPlanCount > 0,
          hasCompletedAction: completedActionCount > 0,
        },
      };
    }),

  completeWelcome: protectedProcedure
    .mutation(async ({ ctx }) => {
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { welcomeCompletedAt: new Date() },
      });
      return { success: true };
    }),
});