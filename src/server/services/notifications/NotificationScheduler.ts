import { db } from '~/server/db';
import { type Prisma } from '@prisma/client';
import { WhatsAppNotificationService } from './WhatsAppNotificationService';
import { NotificationTemplates } from './NotificationTemplates';
import { addDays, setHours, setMinutes, startOfDay, startOfWeek } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export enum NotificationType {
  TASK_REMINDER = 'task_reminder',
  PROJECT_UPDATE = 'project_update',
  DAILY_SUMMARY = 'daily_summary',
  WEEKLY_SUMMARY = 'weekly_summary',
}

export interface NotificationContent {
  title: string;
  message: string;
  metadata?: Prisma.JsonObject;
}

export class NotificationScheduler {
  private static instance: NotificationScheduler;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): NotificationScheduler {
    if (!NotificationScheduler.instance) {
      NotificationScheduler.instance = new NotificationScheduler();
    }
    return NotificationScheduler.instance;
  }

  /**
   * Start the notification scheduler
   */
  start(): void {
    if (this.intervalId) {
      console.log('Notification scheduler already running');
      return;
    }

    console.log('Starting notification scheduler...');
    
    // Run immediately
    void this.processScheduledNotifications();
    void this.scheduleRecurringNotifications();
    
    // Check every minute
    this.intervalId = setInterval(() => {
      void this.processScheduledNotifications();
    }, 60 * 1000);

    // Schedule recurring notifications every hour
    setInterval(() => {
      void this.scheduleRecurringNotifications();
    }, 60 * 60 * 1000);
  }

  /**
   * Stop the notification scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Notification scheduler stopped');
    }
  }

  /**
   * Process pending scheduled notifications
   */
  private async processScheduledNotifications(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    
    try {
      const now = new Date();
      
      // Get all pending notifications that should be sent
      const notifications = await db.scheduledNotification.findMany({
        where: {
          status: 'pending',
          scheduledFor: {
            lte: now,
          },
        },
        include: {
          user: true,
          integration: {
            include: {
              whatsappConfig: true,
            },
          },
        },
        orderBy: {
          scheduledFor: 'asc',
        },
        take: 50, // Process in batches
      });

      // Process each notification
      for (const notification of notifications) {
        await this.sendNotification(notification);
      }
    } catch (error) {
      console.error('Error processing scheduled notifications:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Send a single notification
   */
  private async sendNotification(notification: any): Promise<void> {
    try {
      // Update status to processing
      await db.scheduledNotification.update({
        where: { id: notification.id },
        data: {
          status: 'processing',
          attempts: { increment: 1 },
        },
      });

      // Determine phone number
      let phoneNumber = notification.recipientPhone;
      
      if (!phoneNumber && notification.integration?.whatsappConfig) {
        // Try to get phone number from user mapping
        const mapping = await db.integrationUserMapping.findFirst({
          where: {
            userId: notification.userId,
            integrationId: notification.integrationId!,
          },
        });
        
        phoneNumber = mapping?.externalUserId;
      }

      if (!phoneNumber) {
        throw new Error('No phone number found for notification');
      }

      // Send via WhatsApp
      const whatsappService = WhatsAppNotificationService.getInstance();
      await whatsappService.sendNotification({
        title: notification.title,
        message: notification.message,
        metadata: {
          integrationId: notification.integration.whatsappConfig.id,
          phoneNumber: phoneNumber,
        }
      });

      // Mark as sent
      await db.scheduledNotification.update({
        where: { id: notification.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      console.log(`✅ Sent notification ${notification.id} to ${phoneNumber}`);
    } catch (error) {
      console.error(`Failed to send notification ${notification.id}:`, error);
      
      // Update error status
      await db.scheduledNotification.update({
        where: { id: notification.id },
        data: {
          status: notification.attempts >= 3 ? 'failed' : 'pending',
          lastError: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  /**
   * Schedule recurring notifications (daily/weekly summaries)
   */
  private async scheduleRecurringNotifications(): Promise<void> {
    try {
      // Get all active notification preferences
      const preferences = await db.notificationPreference.findMany({
        where: {
          enabled: true,
          OR: [
            { dailySummary: true },
            { weeklySummary: true },
          ],
        },
        include: {
          user: true,
          integration: true,
        },
      });

      for (const pref of preferences) {
        // Schedule daily summary
        if (pref.dailySummary && pref.dailySummaryTime) {
          await this.scheduleDailySummary(pref);
        }

        // Schedule weekly summary
        if (pref.weeklySummary && pref.weeklyDayOfWeek) {
          await this.scheduleWeeklySummary(pref);
        }
      }
    } catch (error) {
      console.error('Error scheduling recurring notifications:', error);
    }
  }

  /**
   * Schedule a daily summary notification
   */
  private async scheduleDailySummary(preference: any): Promise<void> {
    const now = new Date();
    const userTimezone = preference.timezone || 'UTC';
    
    // Parse the time in user's timezone
    const [hours, minutes] = preference.dailySummaryTime.split(':').map(Number);
    const userNow = toZonedTime(now, userTimezone);
    const scheduledTime = setMinutes(setHours(userNow, hours), minutes);
    
    // Convert back to UTC
    const scheduledTimeUtc = fromZonedTime(scheduledTime, userTimezone);
    
    // If time has passed today, schedule for tomorrow
    if (scheduledTimeUtc <= now) {
      scheduledTimeUtc.setDate(scheduledTimeUtc.getDate() + 1);
    }

    // Check if notification already scheduled
    const existing = await db.scheduledNotification.findFirst({
      where: {
        userId: preference.userId,
        type: NotificationType.DAILY_SUMMARY,
        status: 'pending',
        scheduledFor: {
          gte: startOfDay(scheduledTimeUtc),
          lt: addDays(startOfDay(scheduledTimeUtc), 1),
        },
      },
    });

    if (!existing) {
      await this.createNotification({
        userId: preference.userId,
        type: NotificationType.DAILY_SUMMARY,
        scheduledFor: scheduledTimeUtc,
        integrationId: preference.integrationId,
        title: 'Daily Task Summary',
        message: '', // Will be generated when sending
      });
    }
  }

  /**
   * Schedule a weekly summary notification
   */
  private async scheduleWeeklySummary(preference: any): Promise<void> {
    const now = new Date();
    const userTimezone = preference.timezone || 'UTC';
    
    // Get next occurrence of the specified day
    const userNow = toZonedTime(now, userTimezone);
    const targetDay = preference.weeklyDayOfWeek;
    const currentDay = userNow.getDay() || 7; // Sunday = 7
    
    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }
    
    const scheduledDate = addDays(userNow, daysUntilTarget);
    const [hours, minutes] = (preference.dailySummaryTime || '09:00').split(':').map(Number);
    const scheduledTime = setMinutes(setHours(scheduledDate, hours), minutes);
    
    // Convert back to UTC
    const scheduledTimeUtc = fromZonedTime(scheduledTime, userTimezone);

    // Check if notification already scheduled
    const weekStart = startOfWeek(scheduledTimeUtc, { weekStartsOn: 1 });
    const existing = await db.scheduledNotification.findFirst({
      where: {
        userId: preference.userId,
        type: NotificationType.WEEKLY_SUMMARY,
        status: 'pending',
        scheduledFor: {
          gte: weekStart,
          lt: addDays(weekStart, 7),
        },
      },
    });

    if (!existing) {
      await this.createNotification({
        userId: preference.userId,
        type: NotificationType.WEEKLY_SUMMARY,
        scheduledFor: scheduledTimeUtc,
        integrationId: preference.integrationId,
        title: 'Weekly Task Summary',
        message: '', // Will be generated when sending
      });
    }
  }

  /**
   * Schedule task reminders
   */
  async scheduleTaskReminders(
    userId: string,
    taskId: string,
    taskTitle: string,
    dueDate: Date
  ): Promise<void> {
    // Get user preferences
    const preference = await db.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preference?.enabled || !preference.taskReminders) {
      return;
    }

    // Schedule reminders based on preferences
    for (const minutesBefore of preference.reminderMinutesBefore) {
      const reminderTime = new Date(dueDate.getTime() - minutesBefore * 60 * 1000);
      
      // Don't schedule if in the past
      if (reminderTime <= new Date()) {
        continue;
      }

      // Check if already scheduled
      const existing = await db.scheduledNotification.findFirst({
        where: {
          userId,
          type: NotificationType.TASK_REMINDER,
          status: 'pending',
          metadata: {
            path: ['taskId'],
            equals: taskId,
          },
        },
      });

      if (!existing) {
        await this.createNotification({
          userId,
          type: NotificationType.TASK_REMINDER,
          scheduledFor: reminderTime,
          integrationId: preference.integrationId,
          title: 'Task Reminder',
          message: `Reminder: "${taskTitle}" is due ${this.formatDueTime(minutesBefore)}`,
          metadata: {
            taskId,
            minutesBefore,
          } as Prisma.JsonObject,
        });
      }
    }
  }

  /**
   * Create a scheduled notification
   */
  private async createNotification(data: {
    userId: string;
    type: NotificationType;
    scheduledFor: Date;
    integrationId?: string | null;
    title: string;
    message: string;
    metadata?: Prisma.JsonObject;
  }): Promise<void> {
    // Generate content if needed
    if (!data.message) {
      const content = await this.generateNotificationContent(
        data.userId,
        data.type,
        data.metadata
      );
      data.message = content.message;
      data.title = content.title;
    }

    await db.scheduledNotification.create({
      data: {
        userId: data.userId,
        type: data.type,
        scheduledFor: data.scheduledFor,
        integrationId: data.integrationId,
        title: data.title,
        message: data.message,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Generate notification content
   */
  private async generateNotificationContent(
    userId: string,
    type: NotificationType,
    metadata?: Prisma.JsonObject
  ): Promise<NotificationContent> {
    switch (type) {
      case NotificationType.DAILY_SUMMARY:
        return this.generateDailySummary(userId);
      
      case NotificationType.WEEKLY_SUMMARY:
        return this.generateWeeklySummary(userId);
      
      case NotificationType.PROJECT_UPDATE:
        return this.generateProjectUpdate(userId, metadata);
      
      default:
        return {
          title: 'Notification',
          message: 'You have a new notification',
        };
    }
  }

  /**
   * Generate daily summary content
   */
  private async generateDailySummary(userId: string): Promise<NotificationContent> {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);

    // Get user info
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        title: 'Daily Summary',
        message: 'Unable to generate summary',
      };
    }

    // Get today's tasks
    const tasks = await db.action.findMany({
      where: {
        createdById: userId,
        dueDate: {
          gte: today,
          lt: tomorrow,
        },
      },
      orderBy: {
        priority: 'desc',
      },
    });

    const pendingCount = tasks.filter(t => t.status === 'NOT_COMPLETED').length;
    const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;
    const overdueCount = await db.action.count({
      where: {
        createdById: userId,
        status: 'NOT_COMPLETED',
        dueDate: {
          lt: today,
        },
      },
    });

    return NotificationTemplates.dailySummary({
      user,
      tasks,
      stats: {
        todayCount: tasks.length,
        pendingTasks: pendingCount,
        completedTasks: completedCount,
        overdueCount,
      },
    });
  }

  /**
   * Generate weekly summary content
   */
  private async generateWeeklySummary(userId: string): Promise<NotificationContent> {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 7);

    // Get user info
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        title: 'Weekly Summary',
        message: 'Unable to generate summary',
      };
    }

    // Get all tasks for the user (since we can't filter by date without createdAt field)
    const tasks = await db.action.findMany({
      where: {
        createdById: userId,
      },
    });

    // Since Action model doesn't have date fields, we can only count by status
    const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;
    const activeCount = tasks.filter(t => t.status === 'ACTIVE').length;

    // Get active projects
    const projects = await db.project.findMany({
      where: {
        createdById: userId,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    return NotificationTemplates.weeklySummary({
      user,
      projects,
      stats: {
        totalTasks: tasks.length,
        completedTasks: completedCount,
      },
    });
  }

  /**
   * Generate project update content
   */
  private async generateProjectUpdate(
    userId: string,
    metadata?: Prisma.JsonObject
  ): Promise<NotificationContent> {
    const projectId = metadata?.projectId as string;
    
    if (!projectId) {
      return {
        title: 'Project Update',
        message: 'You have a project update',
      };
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        actions: {
          where: {
            status: 'NOT_COMPLETED',
          },
        },
      },
    });

    if (!project) {
      return {
        title: 'Project Update',
        message: 'Project update available',
      };
    }

    const message = `📋 Project Update: ${project.name}\n\n` +
      `Status: ${project.status}\n` +
      `Progress: ${project.progress}%\n` +
      `Pending tasks: ${project.actions.length}`;

    return {
      title: 'Project Update',
      message,
    };
  }

  /**
   * Format due time for reminders
   */
  private formatDueTime(minutesBefore: number): string {
    if (minutesBefore < 60) {
      return `in ${minutesBefore} minutes`;
    } else if (minutesBefore < 1440) {
      const hours = Math.floor(minutesBefore / 60);
      return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(minutesBefore / 1440);
      return `in ${days} day${days > 1 ? 's' : ''}`;
    }
  }

  /**
   * Cancel scheduled notifications
   */
  async cancelNotifications(filters: {
    userId?: string;
    type?: NotificationType;
    taskId?: string;
  }): Promise<void> {
    const where: Prisma.ScheduledNotificationWhereInput = {
      status: 'pending',
    };

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.taskId) {
      where.metadata = {
        path: ['taskId'],
        equals: filters.taskId,
      };
    }

    await db.scheduledNotification.updateMany({
      where,
      data: {
        status: 'cancelled',
      },
    });
  }
}

// Export singleton instance
export const notificationScheduler = NotificationScheduler.getInstance();