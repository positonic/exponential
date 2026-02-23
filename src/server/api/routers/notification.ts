import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const notificationRouter = createTRPCRouter({
  // Get user notification preferences
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const preferences = await ctx.db.notificationPreference.findUnique({
      where: {
        userId: ctx.session.user.id,
      },
    });

    if (!preferences) {
      // Create default preferences if they don't exist
      const defaultPreferences = await ctx.db.notificationPreference.create({
        data: {
          userId: ctx.session.user.id,
          enabled: true,
          dailySummary: false,
          weeklySummary: false,
          taskReminders: true,
          projectUpdates: true,
          quietHoursEnabled: false,
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00"
        },
      });
      return defaultPreferences;
    }

    return preferences;
  }),

  // Update notification preferences
  updatePreferences: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean().optional(),
        dailySummary: z.boolean().optional(),
        weeklySummary: z.boolean().optional(),
        taskReminders: z.boolean().optional(),
        projectUpdates: z.boolean().optional(),
        quietHoursStart: z.string().optional(),
        quietHoursEnd: z.string().optional(),
        weeklyDayOfWeek: z.number().optional(),
        reminderMinutesBefore: z.array(z.number()).optional(),
        integrationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Update preferences
      const preferences = await ctx.db.notificationPreference.upsert({
        where: {
          userId: ctx.session.user.id,
        },
        update: {
          ...input,
        },
        create: {
          userId: ctx.session.user.id,
          enabled: input.enabled ?? true,
          dailySummary: input.dailySummary ?? false,
          weeklySummary: input.weeklySummary ?? false,
          taskReminders: input.taskReminders ?? true,
          projectUpdates: input.projectUpdates ?? true,
          quietHoursStart: input.quietHoursStart ?? "22:00",
          quietHoursEnd: input.quietHoursEnd ?? "07:00",
          ...input,
        },
      });

      // Reschedule notifications based on new preferences
      // TODO: Add logic to update existing scheduled notifications if needed

      return preferences;
    }),

  // Get scheduled notifications
  getScheduledNotifications: protectedProcedure
    .input(z.object({
      status: z.enum(['pending', 'sent', 'failed', 'cancelled']).optional(),
      type: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const notifications = await ctx.db.scheduledNotification.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input.status && { status: input.status }),
          ...(input.type && { type: input.type }),
        },
        orderBy: {
          scheduledFor: 'desc',
        },
        take: input.limit,
        include: {
          integration: true,
        },
      });

      return notifications;
    }),

  // Cancel scheduled notification
  cancelNotification: protectedProcedure
    .input(z.object({
      notificationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const notification = await ctx.db.scheduledNotification.findFirst({
        where: {
          id: input.notificationId,
          userId: ctx.session.user.id,
        },
      });

      if (!notification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      if (notification.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only cancel pending notifications',
        });
      }

      await ctx.db.scheduledNotification.update({
        where: {
          id: input.notificationId,
        },
        data: {
          status: 'cancelled',
        },
      });
    }),

  // Mark notification as read (for UI notifications)
  markNotificationRead: protectedProcedure
    .input(z.object({
      notificationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const notification = await ctx.db.scheduledNotification.findFirst({
        where: {
          id: input.notificationId,
          userId: ctx.session.user.id,
        },
      });

      if (!notification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      // Update status to 'sent' to mark as read/shown
      await ctx.db.scheduledNotification.update({
        where: {
          id: input.notificationId,
        },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      return { success: true };
    }),

  // Test notification
  sendTestNotification: protectedProcedure
    .input(z.object({
      type: z.string().default('test'),
    }))
    .mutation(async ({ ctx, input }) => {
      const preferences = await ctx.db.notificationPreference.findUnique({
        where: {
          userId: ctx.session.user.id,
        },
      });

      if (!preferences?.enabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Notifications are disabled for this user',
        });
      }

      // Create a test notification
      const notification = await ctx.db.scheduledNotification.create({
        data: {
          userId: ctx.session.user.id,
          type: input.type,
          title: 'Test Notification',
          status: 'pending',
          scheduledFor: new Date(Date.now() + 1000), // 1 second from now
          recipientPhone: undefined, // Will be resolved by the notification scheduler
          integrationId: preferences.integrationId || undefined,
          message: 'This is a test notification from your Task Manager.',
        },
      });

      // The notification will be processed by the scheduler on its next run
      // Since processScheduledNotifications is private, we can't trigger it manually

      return {
        success: true,
        notificationId: notification.id,
      };
    }),

  // Get notification stats
  getNotificationStats: protectedProcedure
    .query(async ({ ctx }) => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [total, sent, failed, pending] = await Promise.all([
        ctx.db.scheduledNotification.count({
          where: {
            userId: ctx.session.user.id,
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        }),
        ctx.db.scheduledNotification.count({
          where: {
            userId: ctx.session.user.id,
            status: 'sent',
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        }),
        ctx.db.scheduledNotification.count({
          where: {
            userId: ctx.session.user.id,
            status: 'failed',
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        }),
        ctx.db.scheduledNotification.count({
          where: {
            userId: ctx.session.user.id,
            status: 'pending',
          },
        }),
      ]);

      return {
        total,
        sent,
        failed,
        pending,
        successRate: total > 0 ? Math.round((sent / total) * 100) : 0,
      };
    }),

  // Get user's per-workspace email notification override
  getWorkspaceOverride: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const override = await ctx.db.workspaceNotificationOverride.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      const workspace = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { enableEmailNotifications: true, name: true },
      });

      return {
        override,
        workspaceDefault: workspace?.enableEmailNotifications ?? true,
        workspaceName: workspace?.name ?? "",
      };
    }),

  // Set or remove user's per-workspace email notification override
  setWorkspaceOverride: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        emailNotifications: z.boolean().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.emailNotifications === null) {
        await ctx.db.workspaceNotificationOverride.deleteMany({
          where: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        });
        return { status: "removed" as const };
      }

      return ctx.db.workspaceNotificationOverride.upsert({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
        update: { emailNotifications: input.emailNotifications },
        create: {
          userId: ctx.session.user.id,
          workspaceId: input.workspaceId,
          emailNotifications: input.emailNotifications,
        },
      });
    }),

  // Get all workspace overrides for the current user (for settings page)
  getAllWorkspaceOverrides: protectedProcedure.query(async ({ ctx }) => {
    const overrides = await ctx.db.workspaceNotificationOverride.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            enableEmailNotifications: true,
          },
        },
      },
    });

    const memberships = await ctx.db.workspaceUser.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            enableEmailNotifications: true,
          },
        },
      },
    });

    return { overrides, memberships };
  }),
});