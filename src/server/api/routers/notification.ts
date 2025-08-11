import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { notificationScheduler } from "~/server/services/notifications/init";

export const notificationRouter = createTRPCRouter({
  // Get user notification preferences
  getPreferences: protectedProcedure
    .query(async ({ ctx }) => {
      const preferences = await ctx.db.notificationPreference.findUnique({
        where: {
          userId: ctx.session.user.id,
        },
        include: {
          integration: true,
        },
      });

      // Return default preferences if none exist
      if (!preferences) {
        return {
          enabled: true,
          integrationId: null,
          taskReminders: true,
          projectUpdates: true,
          dailySummary: true,
          weeklySummary: false,
          timezone: 'UTC',
          dailySummaryTime: '09:00',
          weeklyDayOfWeek: 1,
          reminderMinutesBefore: [15, 60, 1440],
          quietHoursEnabled: false,
          quietHoursStart: null,
          quietHoursEnd: null,
        };
      }

      return preferences;
    }),

  // Update notification preferences
  updatePreferences: protectedProcedure
    .input(z.object({
      enabled: z.boolean(),
      integrationId: z.string().optional(),
      taskReminders: z.boolean(),
      projectUpdates: z.boolean(),
      dailySummary: z.boolean(),
      weeklySummary: z.boolean(),
      timezone: z.string(),
      dailySummaryTime: z.string().regex(/^\d{2}:\d{2}$/),
      weeklyDayOfWeek: z.number().min(1).max(7),
      reminderMinutesBefore: z.array(z.number()),
      quietHoursEnabled: z.boolean(),
      quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate integration if provided
      if (input.integrationId) {
        const integration = await ctx.db.integration.findFirst({
          where: {
            id: input.integrationId,
            userId: ctx.session.user.id,
            provider: 'whatsapp',
            status: 'ACTIVE',
          },
        });

        if (!integration) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'WhatsApp integration not found or not active',
          });
        }
      }

      // Upsert preferences
      const preferences = await ctx.db.notificationPreference.upsert({
        where: {
          userId: ctx.session.user.id,
        },
        create: {
          userId: ctx.session.user.id,
          ...input,
          integrationId: input.integrationId || null,
          quietHoursStart: input.quietHoursEnabled ? input.quietHoursStart : null,
          quietHoursEnd: input.quietHoursEnabled ? input.quietHoursEnd : null,
        },
        update: {
          ...input,
          integrationId: input.integrationId || null,
          quietHoursStart: input.quietHoursEnabled ? input.quietHoursStart : null,
          quietHoursEnd: input.quietHoursEnabled ? input.quietHoursEnd : null,
        },
      });

      // Reschedule notifications based on new preferences
      if (preferences.enabled) {
        // This will be picked up on the next scheduler run
        console.log('Notification preferences updated, will reschedule on next run');
      }

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
      // Verify ownership
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

      // Update status
      const updated = await ctx.db.scheduledNotification.update({
        where: {
          id: input.notificationId,
        },
        data: {
          status: 'cancelled',
        },
      });

      return updated;
    }),

  // Test notification
  sendTestNotification: protectedProcedure
    .input(z.object({
      type: z.enum(['task_reminder', 'daily_summary', 'weekly_summary', 'project_update']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user preferences
      const preferences = await ctx.db.notificationPreference.findUnique({
        where: {
          userId: ctx.session.user.id,
        },
      });

      if (!preferences?.enabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Notifications are disabled. Enable them in preferences first.',
        });
      }

      // Get user's phone number mapping
      const phoneMapping = await ctx.db.integrationUserMapping.findFirst({
        where: {
          userId: ctx.session.user.id,
          integrationId: preferences.integrationId || undefined,
        },
      });

      if (!phoneMapping) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No phone number mapping found. Please link your WhatsApp number first.',
        });
      }

      // Create a test notification
      const notification = await ctx.db.scheduledNotification.create({
        data: {
          userId: ctx.session.user.id,
          type: input.type,
          scheduledFor: new Date(), // Send immediately
          integrationId: preferences.integrationId,
          recipientPhone: phoneMapping.externalUserId,
          title: `Test ${input.type.replace('_', ' ')}`,
          message: 'This is a test notification from your Task Manager.',
          metadata: {
            isTest: true,
          },
        },
      });

      // Process immediately
      await notificationScheduler.processScheduledNotifications();

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
});