import cron from 'node-cron';
import { db } from '~/server/db';
import { addDays, startOfDay } from 'date-fns';

interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
  enabled: boolean;
}

/**
 * PMScheduler - Product Manager automation scheduler using node-cron
 * 
 * Handles scheduled PM tasks like:
 * - Daily standup reminders
 * - Weekly review preparation
 * - Overdue action alerts
 * - Project health checks
 * - Meeting preparation reminders
 */
export class PMScheduler {
  private static instance: PMScheduler;
  private tasks = new Map<string, cron.ScheduledTask>();
  private taskConfigs: ScheduledTask[] = [];
  private isRunning = false;

  private constructor() {
    this.initializeDefaultTasks();
  }

  static getInstance(): PMScheduler {
    if (!PMScheduler.instance) {
      PMScheduler.instance = new PMScheduler();
    }
    return PMScheduler.instance;
  }

  /**
   * Initialize default PM automation tasks
   */
  private initializeDefaultTasks(): void {
    this.taskConfigs = [
      {
        id: 'daily-overdue-check',
        name: 'Daily Overdue Actions Check',
        cronExpression: '0 9 * * *', // 9 AM daily
        handler: this.checkOverdueActions.bind(this),
        enabled: true,
      },
      {
        id: 'daily-planning-reminder',
        name: 'Daily Planning Reminder',
        cronExpression: '0 8 * * 1-5', // 8 AM weekdays
        handler: this.sendDailyPlanningReminder.bind(this),
        enabled: true,
      },
      {
        id: 'weekly-review-prep',
        name: 'Weekly Review Preparation',
        cronExpression: '0 14 * * 5', // 2 PM on Fridays
        handler: this.prepareWeeklyReview.bind(this),
        enabled: true,
      },
      {
        id: 'project-health-check',
        name: 'Project Health Check',
        cronExpression: '0 10 * * 1', // 10 AM on Mondays
        handler: this.checkProjectHealth.bind(this),
        enabled: true,
      },
      {
        id: 'meeting-prep-reminder',
        name: 'Meeting Preparation Reminder',
        cronExpression: '*/30 * * * *', // Every 30 minutes
        handler: this.checkUpcomingMeetings.bind(this),
        enabled: true,
      },
    ];
  }

  /**
   * Start all scheduled tasks
   */
  start(): void {
    if (this.isRunning) {
      console.log('[PMScheduler] Already running');
      return;
    }

    console.log('[PMScheduler] Starting scheduler...');

    for (const config of this.taskConfigs) {
      if (!config.enabled) continue;

      try {
        const task = cron.schedule(config.cronExpression, async () => {
          console.log(`[PMScheduler] Running task: ${config.name}`);
          try {
            await config.handler();
            console.log(`[PMScheduler] Completed task: ${config.name}`);
          } catch (error) {
            console.error(`[PMScheduler] Error in task ${config.name}:`, error);
          }
        }, {
          scheduled: true,
          timezone: 'Europe/Berlin', // TODO: Make this configurable per user
        });

        this.tasks.set(config.id, task);
        console.log(`[PMScheduler] Scheduled task: ${config.name} (${config.cronExpression})`);
      } catch (error) {
        console.error(`[PMScheduler] Failed to schedule task ${config.name}:`, error);
      }
    }

    this.isRunning = true;
    console.log(`[PMScheduler] Started ${this.tasks.size} tasks`);
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[PMScheduler] Not running');
      return;
    }

    console.log('[PMScheduler] Stopping scheduler...');

    for (const [id, task] of this.tasks) {
      task.stop();
      console.log(`[PMScheduler] Stopped task: ${id}`);
    }

    this.tasks.clear();
    this.isRunning = false;
    console.log('[PMScheduler] Stopped');
  }

  /**
   * Run a specific task immediately (for testing)
   */
  async runTask(taskId: string): Promise<void> {
    const config = this.taskConfigs.find(t => t.id === taskId);
    if (!config) {
      throw new Error(`Task not found: ${taskId}`);
    }

    console.log(`[PMScheduler] Manually running task: ${config.name}`);
    await config.handler();
  }

  /**
   * Get status of all tasks
   */
  getStatus(): { id: string; name: string; enabled: boolean; running: boolean }[] {
    return this.taskConfigs.map(config => ({
      id: config.id,
      name: config.name,
      enabled: config.enabled,
      running: this.tasks.has(config.id),
    }));
  }

  // ============= Task Handlers =============

  /**
   * Check for overdue actions and create alerts
   */
  private async checkOverdueActions(): Promise<void> {
    const today = startOfDay(new Date());

    const overdueActions = await db.action.findMany({
      where: {
        status: 'ACTIVE',
        scheduledStart: {
          lt: today,
        },
      },
      include: {
        project: true,
        createdBy: true,
      },
    });

    if (overdueActions.length === 0) {
      console.log('[PMScheduler] No overdue actions found');
      return;
    }

    // Group by user
    const actionsByUser = new Map<string, typeof overdueActions>();
    for (const action of overdueActions) {
      const userId = action.createdById;
      if (!actionsByUser.has(userId)) {
        actionsByUser.set(userId, []);
      }
      actionsByUser.get(userId)!.push(action);
    }

    // Log summary (TODO: Send notifications via WhatsApp/email)
    for (const [userId, actions] of actionsByUser) {
      console.log(`[PMScheduler] User ${userId} has ${actions.length} overdue actions`);
      // TODO: Create notification or trigger Mastra agent
    }
  }

  /**
   * Send daily planning reminder
   */
  private async sendDailyPlanningReminder(): Promise<void> {
    const today = startOfDay(new Date());
    
    // Find users who haven't created a daily plan for today
    const usersWithPlans = await db.dailyPlan.findMany({
      where: {
        date: today,
      },
      select: {
        userId: true,
      },
    });

    const usersWithPlanIds = new Set(usersWithPlans.map(p => p.userId));

    // Get all active users (simplified - could filter by last login)
    const activeUsers = await db.user.findMany({
      where: {
        id: {
          notIn: Array.from(usersWithPlanIds),
        },
      },
      take: 100, // Limit for now
    });

    console.log(`[PMScheduler] ${activeUsers.length} users need daily planning reminder`);

    // TODO: Send notifications via preferred channel
  }

  /**
   * Prepare weekly review summary
   */
  private async prepareWeeklyReview(): Promise<void> {
    const today = new Date();
    const weekStart = addDays(today, -7);

    // Get completed actions this week
    const completedActions = await db.action.count({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: weekStart,
          lte: today,
        },
      },
    });

    // Get projects updated this week
    const projectsUpdated = await db.project.count({
      where: {
        updatedAt: {
          gte: weekStart,
          lte: today,
        },
      },
    });

    console.log(`[PMScheduler] Weekly summary: ${completedActions} actions completed, ${projectsUpdated} projects updated`);

    // TODO: Generate detailed weekly review and send to users
  }

  /**
   * Check project health scores
   */
  private async checkProjectHealth(): Promise<void> {
    const projects = await db.project.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        healthScore: true,
        createdById: true,
      },
    });

    const unhealthyProjects = projects.filter(p => (p.healthScore ?? 100) < 50);

    if (unhealthyProjects.length > 0) {
      console.log(`[PMScheduler] ${unhealthyProjects.length} projects need attention:`);
      for (const project of unhealthyProjects) {
        console.log(`  - ${project.name} (health: ${project.healthScore ?? 'unknown'})`);
      }
    } else {
      console.log('[PMScheduler] All projects healthy');
    }

    // TODO: Create alerts for unhealthy projects
  }

  /**
   * Check for upcoming meetings and send prep reminders
   */
  private async checkUpcomingMeetings(): Promise<void> {
    const now = new Date();
    const inOneHour = addDays(now, 0);
    inOneHour.setHours(now.getHours() + 1);

    // Find meetings starting in the next hour
    const upcomingMeetings = await db.meeting.findMany({
      where: {
        date: {
          gte: now,
          lte: inOneHour,
        },
      },
      include: {
        createdBy: true,
        project: true,
      },
    });

    if (upcomingMeetings.length > 0) {
      console.log(`[PMScheduler] ${upcomingMeetings.length} meetings in the next hour`);
      // TODO: Send prep reminders with meeting context
    }
  }
}

// Export singleton instance
export const pmScheduler = PMScheduler.getInstance();
