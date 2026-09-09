import type { Project, User } from '@prisma/client';

export interface TemplateContext {
  user: Pick<User, 'id' | 'name' | 'email'>;
  projects?: Array<Pick<Project, 'id' | 'name' | 'status' | 'progress'>>;
  stats?: {
    totalTasks?: number;
    completedTasks?: number;
  };
  customData?: Record<string, any>;
}

// NOTE: The dead setInterval scheduler's task-reminder and project-update
// templates (and their helpers) were retired with the unified pipeline
// (ADR-0045). Due-date reminders build their own content in emit/content.ts.
// The daily summary is now a structured digest with its own renderers
// (emit/dailySummary, ADR-0059); only the weekly summary template below is
// still used (by emit/summaries.ts).
export class NotificationTemplates {
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
}
