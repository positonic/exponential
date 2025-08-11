import { format } from 'date-fns';
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

export class NotificationTemplates {
  /**
   * Task reminder template
   */
  static taskReminder(
    task: Pick<Action, 'name' | 'description' | 'dueDate' | 'priority'>,
    minutesBefore: number
  ): { title: string; message: string } {
    const dueTime = this.formatDueTime(minutesBefore);
    const priorityEmoji = this.getPriorityEmoji(task.priority);
    
    let message = `${priorityEmoji} Reminder: "${task.name}" is due ${dueTime}`;
    
    if (task.description) {
      message += `\n\n📝 ${task.description}`;
    }
    
    if (task.dueDate) {
      message += `\n\n⏰ Due: ${format(task.dueDate, 'PPp')}`;
    }

    return {
      title: '⏰ Task Reminder',
      message,
    };
  }

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
   * Project update template
   */
  static projectUpdate(
    project: Pick<Project, 'name' | 'status' | 'progress'>,
    context: TemplateContext
  ): { title: string; message: string } {
    const { tasks = [] } = context;
    const statusEmoji = this.getProjectStatusEmoji(project.status);
    
    let message = `${statusEmoji} *Project Update: ${project.name}*\n\n`;
    
    message += `📊 *Status:* ${this.formatProjectStatus(project.status)}\n`;
    message += `📈 *Progress:* ${project.progress}%\n`;
    
    const projectTasks = tasks.filter(t => t.status !== 'COMPLETED');
    
    if (projectTasks.length > 0) {
      message += `\n📋 *Pending Tasks:* ${projectTasks.length}\n`;
      
      const urgentTasks = projectTasks.filter(t => t.priority === 'HIGH');
      if (urgentTasks.length > 0) {
        message += `⚡ *Urgent:* ${urgentTasks.length}\n`;
      }
    } else {
      message += `\n✅ All tasks completed!`;
    }
    
    if (project.progress === 100) {
      message += `\n\n🎉 Congratulations! Project completed!`;
    } else if (project.progress >= 80) {
      message += `\n\n🏁 Almost there! Final push!`;
    }

    return {
      title: '📋 Project Update',
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
  private static formatDueTime(minutesBefore: number): string {
    if (minutesBefore === 0) {
      return 'now';
    } else if (minutesBefore < 60) {
      return `in ${minutesBefore} minutes`;
    } else if (minutesBefore < 1440) {
      const hours = Math.floor(minutesBefore / 60);
      return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(minutesBefore / 1440);
      return `in ${days} day${days > 1 ? 's' : ''}`;
    }
  }

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

  private static formatProjectStatus(status?: string): string {
    switch (status) {
      case 'ACTIVE':
        return 'Active';
      case 'COMPLETED':
        return 'Completed';
      case 'ON_HOLD':
        return 'On Hold';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return 'Unknown';
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