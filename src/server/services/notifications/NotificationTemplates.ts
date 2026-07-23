import type { Action, Project, User } from '@prisma/client';

export interface TemplateContext {
  user: Pick<User, 'id' | 'name' | 'email'>;
  tasks?: Array<Pick<Action, 'id' | 'name' | 'description' | 'priority' | 'status' | 'dueDate'>>;
  projects?: Array<Pick<Project, 'id' | 'name' | 'status' | 'progress'>>;
  stats?: {
    totalTasks?: number;
    completedTasks?: number;
    pendingTasks?: number;
    overdueCount?: number;
    todayCount?: number;
    thisWeekCount?: number;
  };
  customData?: Record<string, any>;
}

// NOTE: The dead setInterval scheduler's task-reminder and project-update
// templates (and their helpers) were retired with the unified pipeline
// (ADR-0045). Due-date reminders build their own content in emit/content.ts;
// only the daily/weekly summary templates below are still used (by emit/summaries.ts).
export class NotificationTemplates {
  /**
   * Daily summary template
   */
  static dailySummary(context: TemplateContext): { title: string; message: string } {
    const { user, tasks = [], stats = {} } = context;
    const greeting = this.getGreeting();
    
    let message = `${greeting} ${user.name || 'there'}! 👋\n\n`;
    message += `📅 *Daily Task Summary*\n\n`;
    
    if (stats.todayCount === 0) {
      message += `✨ You have no tasks scheduled for today!\n`;
      message += `Take a moment to plan your day or catch up on other work.`;
    } else {
      message += `📊 *Today's Overview:*\n`;
      message += `• Total tasks: ${stats.todayCount || 0}\n`;
      message += `• Completed: ${stats.completedTasks || 0} ✅\n`;
      message += `• Pending: ${stats.pendingTasks || 0} ⏳\n`;
      
      if (stats.overdueCount && stats.overdueCount > 0) {
        message += `• Overdue: ${stats.overdueCount} ⚠️\n`;
      }
      
      // List top priority tasks
      const topTasks = tasks
        .filter(t => t.status !== 'COMPLETED')
        .sort((a, b) => {
          const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          return (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - 
                 (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
        })
        .slice(0, 3);
      
      if (topTasks.length > 0) {
        message += `\n📌 *Top Priorities:*\n`;
        topTasks.forEach(task => {
          const emoji = this.getPriorityEmoji(task.priority);
          message += `${emoji} ${task.name}\n`;
        });
      }
    }
    
    message += `\n💪 Have a productive day!`;

    return {
      title: '☀️ Daily Summary',
      message,
    };
  }

  /**
   * Weekly summary template
   */
  static weeklySummary(context: TemplateContext): { title: string; message: string } {
    const { user, stats = {}, projects = [] } = context;
    
    let message = `Hi ${user.name || 'there'}! 👋\n\n`;
    message += `📊 *Weekly Performance Summary*\n\n`;
    
    message += `🎯 *Task Statistics:*\n`;
    message += `• Completed this week: ${stats.completedTasks || 0} ✅\n`;
    message += `• Created this week: ${stats.totalTasks || 0} 📝\n`;
    
    if (stats.completedTasks && stats.totalTasks) {
      const completionRate = Math.round((stats.completedTasks / stats.totalTasks) * 100);
      message += `• Completion rate: ${completionRate}% 📈\n`;
      
      if (completionRate >= 80) {
        message += `\n🌟 Excellent work! You're crushing it!`;
      } else if (completionRate >= 60) {
        message += `\n👍 Good progress! Keep it up!`;
      } else {
        message += `\n💡 Room for improvement. You've got this!`;
      }
    }
    
    // Project updates
    if (projects.length > 0) {
      message += `\n\n📁 *Active Projects:*\n`;
      projects.slice(0, 3).forEach(project => {
        const statusEmoji = this.getProjectStatusEmoji(project.status);
        message += `${statusEmoji} ${project.name} (${project.progress}%)\n`;
      });
    }
    
    message += `\n\n🚀 Ready for another productive week!`;

    return {
      title: '📊 Weekly Summary',
      message,
    };
  }

  /**
   * Custom template
   */
  static custom(title: string, template: string, context: TemplateContext): { title: string; message: string } {
    let message = template;
    
    // Replace placeholders
    message = message.replace(/\{user\.name\}/g, context.user.name || 'User');
    message = message.replace(/\{user\.email\}/g, context.user.email || '');
    
    // Replace stats placeholders
    if (context.stats) {
      Object.entries(context.stats).forEach(([key, value]) => {
        const regex = new RegExp(`\\{stats\\.${key}\\}`, 'g');
        message = message.replace(regex, String(value));
      });
    }
    
    // Replace custom data placeholders
    if (context.customData) {
      Object.entries(context.customData).forEach(([key, value]) => {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        message = message.replace(regex, String(value));
      });
    }

    return { title, message };
  }

  /**
   * Helper methods
   */
  private static getPriorityEmoji(priority?: string | null): string {
    switch (priority) {
      case 'HIGH':
        return '🔴';
      case 'MEDIUM':
        return '🟡';
      case 'LOW':
        return '🟢';
      default:
        return '⚪';
    }
  }

  private static getProjectStatusEmoji(status?: string): string {
    switch (status) {
      case 'ACTIVE':
        return '🚀';
      case 'COMPLETED':
        return '✅';
      case 'ON_HOLD':
        return '⏸️';
      case 'CANCELLED':
        return '❌';
      default:
        return '📁';
    }
  }

  private static getGreeting(): string {
    const hour = new Date().getHours();
    
    if (hour < 5) {
      return '🌙 Good evening';
    } else if (hour < 12) {
      return '☀️ Good morning';
    } else if (hour < 17) {
      return '☀️ Good afternoon';
    } else {
      return '🌆 Good evening';
    }
  }
}