import { db } from "~/server/db";
import { startOfWeek, endOfWeek, format, addDays } from "date-fns";

export interface WeeklyReviewSummary {
  title: string;
  message: string;
  weekStart: Date;
  weekEnd: Date;
  userName: string;
}

export interface ProjectProgress {
  id: string;
  name: string;
  status: string;
  completionPercentage: number;
  totalActions: number;
  completedActions: number;
}

export interface WeeklyHighlight {
  type: 'outcome' | 'action';
  title: string;
  description?: string;
  projectName?: string;
  completedAt?: Date;
}

export class WeeklyReviewSummaryService {
  /**
   * Generate a comprehensive weekly review summary for Slack
   */
  async generateWeeklyReviewSummary(
    userId: string,
    weekStart?: Date
  ): Promise<WeeklyReviewSummary> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const actualWeekStart = weekStart ?? startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(actualWeekStart, { weekStartsOn: 1 });

    // Get project progress
    const projectProgress = await this.getProjectProgress(userId);
    
    // Get weekly highlights (recent outcomes and completed actions)
    const highlights = await this.getWeeklyHighlights(userId, actualWeekStart, weekEnd);
    
    // Get upcoming priorities
    const upcomingPriorities = await this.getUpcomingPriorities(userId);

    // Generate the formatted message
    const message = this.formatSlackMessage({
      userName: user.name ?? user.email ?? 'User',
      weekStart: actualWeekStart,
      weekEnd,
      projectProgress,
      highlights,
      upcomingPriorities
    });

    return {
      title: `📊 Weekly Review - ${user.name ?? 'User'} - Week of ${format(actualWeekStart, 'MMM d')}`,
      message,
      weekStart: actualWeekStart,
      weekEnd,
      userName: user.name ?? user.email ?? 'User'
    };
  }

  /**
   * Get progress for all active projects
   */
  private async getProjectProgress(userId: string): Promise<ProjectProgress[]> {
    const projects = await db.project.findMany({
      where: {
        createdById: userId,
        status: 'ACTIVE'
      },
      include: {
        actions: {
          select: {
            id: true,
            status: true,
            kanbanStatus: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 5 // Limit to top 5 active projects
    });

    return projects.map(project => {
      const totalActions = project.actions.length;
      const completedActions = project.actions.filter(action => 
        action.status === 'DONE' || action.kanbanStatus === 'DONE'
      ).length;
      
      const completionPercentage = totalActions > 0 
        ? Math.round((completedActions / totalActions) * 100)
        : 0;

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        completionPercentage,
        totalActions,
        completedActions
      };
    });
  }

  /**
   * Get highlights from the current week (completed outcomes and actions)
   */
  private async getWeeklyHighlights(
    userId: string, 
    weekStart: Date, 
    weekEnd: Date
  ): Promise<WeeklyHighlight[]> {
    const highlights: WeeklyHighlight[] = [];

    // Get recently completed outcomes
    const completedOutcomes = await db.outcome.findMany({
      where: {
        createdById: userId,
        status: 'COMPLETED',
        updatedAt: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      include: {
        project: {
          select: { name: true }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 3
    });

    highlights.push(...completedOutcomes.map(outcome => ({
      type: 'outcome' as const,
      title: outcome.name,
      description: outcome.description ?? undefined,
      projectName: outcome.project?.name,
      completedAt: outcome.updatedAt
    })));

    // Get recently completed high-priority actions
    const completedActions = await db.action.findMany({
      where: {
        createdById: userId,
        OR: [
          { status: 'DONE' },
          { kanbanStatus: 'DONE' }
        ],
        priority: {
          in: ['HIGH', '1st Priority']
        },
        updatedAt: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      include: {
        project: {
          select: { name: true }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 3
    });

    highlights.push(...completedActions.map(action => ({
      type: 'action' as const,
      title: action.name,
      description: action.description ?? undefined,
      projectName: action.project?.name,
      completedAt: action.updatedAt
    })));

    // Sort by completion date and return top 5
    return highlights
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
      .slice(0, 5);
  }

  /**
   * Get upcoming priorities for next week
   */
  private async getUpcomingPriorities(userId: string): Promise<WeeklyHighlight[]> {
    const nextWeekStart = addDays(new Date(), 7);
    const nextWeekEnd = addDays(nextWeekStart, 7);

    // Get pending high-priority actions
    const upcomingActions = await db.action.findMany({
      where: {
        createdById: userId,
        status: {
          not: 'DONE'
        },
        kanbanStatus: {
          not: 'DONE'
        },
        priority: {
          in: ['HIGH', '1st Priority', 'MEDIUM']
        },
        OR: [
          {
            dueDate: {
              gte: nextWeekStart,
              lte: nextWeekEnd
            }
          },
          {
            dueDate: null,
            priority: {
              in: ['HIGH', '1st Priority']
            }
          }
        ]
      },
      include: {
        project: {
          select: { name: true }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' }
      ],
      take: 5
    });

    return upcomingActions.map(action => ({
      type: 'action' as const,
      title: action.name,
      description: action.description ?? undefined,
      projectName: action.project?.name
    }));
  }

  /**
   * Format the data into a rich Slack message
   */
  private formatSlackMessage({
    userName,
    weekStart,
    weekEnd,
    projectProgress,
    highlights,
    upcomingPriorities
  }: {
    userName: string;
    weekStart: Date;
    weekEnd: Date;
    projectProgress: ProjectProgress[];
    highlights: WeeklyHighlight[];
    upcomingPriorities: WeeklyHighlight[];
  }): string {
    const weekRange = `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    
    let message = `📊 *Weekly Review - ${userName}*\n`;
    message += `📅 Week of ${weekRange}\n\n`;

    // Project Progress Section
    if (projectProgress.length > 0) {
      message += `🚀 *Project Progress:*\n`;
      projectProgress.forEach(project => {
        const progressBar = this.createProgressBar(project.completionPercentage);
        message += `• ${project.name}: ${progressBar} ${project.completionPercentage}% (${project.completedActions}/${project.totalActions})\n`;
      });
      message += `\n`;
    }

    // Weekly Highlights Section
    if (highlights.length > 0) {
      message += `✨ *This Week's Highlights:*\n`;
      highlights.forEach(highlight => {
        const emoji = highlight.type === 'outcome' ? '🎯' : '✅';
        const projectText = highlight.projectName ? ` (${highlight.projectName})` : '';
        message += `${emoji} ${highlight.title}${projectText}\n`;
      });
      message += `\n`;
    }

    // Upcoming Priorities Section
    if (upcomingPriorities.length > 0) {
      message += `🎯 *Next Week's Focus:*\n`;
      upcomingPriorities.forEach(priority => {
        const emoji = priority.type === 'outcome' ? '🎯' : '📝';
        const projectText = priority.projectName ? ` (${priority.projectName})` : '';
        message += `${emoji} ${priority.title}${projectText}\n`;
      });
      message += `\n`;
    }

    // Statistics
    const totalProjects = projectProgress.length;
    const avgCompletion = totalProjects > 0 
      ? Math.round(projectProgress.reduce((sum, p) => sum + p.completionPercentage, 0) / totalProjects)
      : 0;
    
    message += `📈 *Summary:*\n`;
    message += `• Active Projects: ${totalProjects}\n`;
    message += `• Average Completion: ${avgCompletion}%\n`;
    message += `• Completed Items: ${highlights.length}\n`;
    message += `• Upcoming Priorities: ${upcomingPriorities.length}\n\n`;

    message += `🔗 View full weekly review: ${process.env.NEXTAUTH_URL ?? 'http://localhost:3002'}/weekly-review`;

    return message;
  }

  /**
   * Create a simple progress bar using Unicode characters
   */
  private createProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}