import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { completeOnboardingStep } from "~/server/services/onboarding/syncOnboardingProgress";

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
      excludeWorkspaceId: z.string().optional(),
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
          ...(input.excludeWorkspaceId ? {
            workspaceMemberships: { none: { workspaceId: input.excludeWorkspaceId } },
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
            onboardingProjectId: true,
          },
        }),
        ctx.db.project.count({ where: { createdById: userId, type: { not: 'onboarding' } } }),
        ctx.db.goal.count({ where: { userId } }),
        ctx.db.outcome.count({ where: { userId } }),
        ctx.db.action.count({
          where: {
            createdById: userId,
            projectId: { not: null },
            status: { notIn: ['DELETED', 'DRAFT'] },
            source: { not: 'onboarding' },
          },
        }),
        // Calendar onboarding step is satisfied by an actual calendar
        // connection (ConnectedAccount), not merely signing in with Google.
        ctx.db.connectedAccount.findMany({
          where: {
            userId,
            provider: { in: ['google', 'microsoft-entra-id'] },
          },
          select: { provider: true },
        }),
        ctx.db.dailyPlan.count({ where: { userId } }),
        ctx.db.action.count({
          where: { createdById: userId, status: 'COMPLETED', source: { not: 'onboarding' } },
        }),
      ]);

      // Sync onboarding progress for calendar connection (fire-and-forget)
      // Calendar accounts are linked via NextAuth OAuth, so we detect it here
      if (calendarAccounts.length > 0) {
        void completeOnboardingStep(ctx.db, userId, "calendar").catch(
          (err: unknown) => { console.error("[onboarding-sync] calendar:", err); },
        );
      }

      return {
        userName: user?.name ?? null,
        welcomeCompletedAt: user?.welcomeCompletedAt ?? null,
        usageType: user?.usageType ?? null,
        userRole: user?.userRole ?? null,
        onboardingProjectId: user?.onboardingProjectId ?? null,
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

  getOnboardingProject: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { onboardingProjectId: true },
      });

      if (!user?.onboardingProjectId) return null;

      const project = await ctx.db.project.findUnique({
        where: { id: user.onboardingProjectId },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          progress: true,
          actions: {
            where: { source: "onboarding" },
            orderBy: { id: "asc" },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              completedAt: true,
            },
          },
        },
      });

      return project;
    }),

  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          name: true,
          email: true,
          image: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return user;
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updatedUser = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { name: input.name },
        select: { name: true },
      });

      return { success: true, name: updatedUser.name };
    }),

  getWorkHours: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          workHoursEnabled: true,
          workDaysJson: true,
          workHoursStart: true,
          workHoursEnd: true,
        },
      });

      let workDays: string[] = [];
      if (user?.workDaysJson) {
        try {
          workDays = JSON.parse(user.workDaysJson) as string[];
        } catch {
          workDays = [];
        }
      }

      return {
        workHoursEnabled: user?.workHoursEnabled ?? false,
        workDays,
        workHoursStart: user?.workHoursStart ?? null,
        workHoursEnd: user?.workHoursEnd ?? null,
      };
    }),

  updateWorkHours: protectedProcedure
    .input(
      z.object({
        workHoursEnabled: z.boolean(),
        workDays: z.array(z.string()), // ["monday", "tuesday", ...]
        workHoursStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Invalid HH:MM (00:00-23:59)'),
        workHoursEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Invalid HH:MM (00:00-23:59)'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { workHoursEnabled, workDays, workHoursStart, workHoursEnd } = input;

      const updatedUser = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          workHoursEnabled,
          workDaysJson: JSON.stringify(workDays),
          workHoursStart,
          workHoursEnd,
        },
        select: {
          workHoursEnabled: true,
          workDaysJson: true,
          workHoursStart: true,
          workHoursEnd: true,
        },
      });

      return {
        success: true,
        workHoursEnabled: updatedUser.workHoursEnabled,
        workDays: updatedUser.workDaysJson ? JSON.parse(updatedUser.workDaysJson) as string[] : [],
        workHoursStart: updatedUser.workHoursStart,
        workHoursEnd: updatedUser.workHoursEnd,
      };
    }),

  completeWelcome: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { onboardingProjectId: true },
      });

      await ctx.db.user.update({
        where: { id: userId },
        data: { welcomeCompletedAt: new Date() },
      });

      // Close out onboarding project so it doesn't linger with stale progress
      if (user?.onboardingProjectId) {
        await ctx.db.action.updateMany({
          where: {
            projectId: user.onboardingProjectId,
            source: 'onboarding',
            status: { not: 'COMPLETED' },
          },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });

        await ctx.db.project.update({
          where: { id: user.onboardingProjectId },
          data: { status: 'COMPLETED', progress: 100 },
        });
      }

      return { success: true };
    }),
});