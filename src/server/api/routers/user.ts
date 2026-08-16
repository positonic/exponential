import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { uploadToBlob } from "~/lib/blob";
import { isGoogleOAuthTester } from "~/lib/googleAuth";

export const userRouter = createTRPCRouter({
  /**
   * Whether this user may use the Google features whose scopes Google has not
   * verified yet (calendar, contacts, Gmail). The UI uses this to show the
   * "premium feature" message instead of connect buttons that would dead-end
   * on Google's unverified-app screen. Google *sign-in* is not affected.
   */
  isGoogleOAuthTester: protectedProcedure.query(({ ctx }) => {
    return isGoogleOAuthTester(ctx.session.user.email);
  }),

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
        ctx.db.project.count({ where: { createdById: userId, type: { not: 'onboarding' } } }),
        ctx.db.goal.count({ where: { userId } }),
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

      // Google's calendar scopes are unverified, so a non-tester's Google
      // connection can't be used — ignore it when scoring the calendar step.
      // Microsoft is a separate, approved OAuth app and always counts.
      const googleCalendarAvailable = isGoogleOAuthTester(ctx.session.user.email);
      const usableCalendarAccounts = calendarAccounts.filter(
        (account) => googleCalendarAvailable || account.provider !== 'google',
      );

      return {
        userName: user?.name ?? null,
        welcomeCompletedAt: user?.welcomeCompletedAt ?? null,
        usageType: user?.usageType ?? null,
        userRole: user?.userRole ?? null,
        googleCalendarAvailable,
        steps: {
          hasProject: projectCount > 0,
          hasGoal: goalCount > 0,
          hasProjectActions: projectActionCount > 0,
          hasCalendar: usableCalendarAccounts.length > 0,
          hasDailyPlan: dailyPlanCount > 0,
          hasCompletedAction: completedActionCount > 0,
        },
      };
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

  getTimezone: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { timezone: true },
    });
    return { timezone: user?.timezone ?? null };
  }),

  updateTimezone: protectedProcedure
    .input(
      z.object({
        timezone: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Accept only names the Intl runtime recognizes — this is what keeps
      // Windows zone names (e.g. "W. Europe Standard Time" from Outlook
      // feeds) and typos out of User.timezone, which work-hours slot
      // interpretation later depends on.
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone });
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${input.timezone}" is not a recognized IANA timezone.`,
        });
      }

      const updated = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { timezone: input.timezone },
        select: { timezone: true },
      });
      return { success: true, timezone: updated.timezone };
    }),

  /**
   * Upload profile image and save URL to user record.
   * (Re-homed from the onboarding router; same behavior.)
   */
  uploadProfileImage: protectedProcedure
    .input(
      z.object({
        base64Data: z.string(),
        contentType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { base64Data } = input;
      const userId = ctx.session.user.id;

      // Upload to Vercel Blob
      const filename = `profile-images/${userId}.png`;
      const blob = await uploadToBlob(base64Data, filename);

      // Update user's image field
      await ctx.db.user.update({
        where: { id: userId },
        data: {
          image: blob.url,
        },
      });

      return {
        success: true,
        imageUrl: blob.url,
      };
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
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { welcomeCompletedAt: new Date() },
      });

      return { success: true };
    }),
});