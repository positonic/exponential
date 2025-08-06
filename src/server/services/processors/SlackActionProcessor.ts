import { ActionProcessor, type ParsedActionItem, type ActionProcessorResult, type ActionProcessorConfig } from './ActionProcessor';
import { db } from '~/server/db';
import { SlackNotificationService } from '../notifications/SlackNotificationService';

export class SlackActionProcessor extends ActionProcessor {
  name = 'Slack Notifications';
  type = 'external' as const;
  private slackService?: SlackNotificationService;

  constructor(config: ActionProcessorConfig) {
    super(config);
  }

  private async getSlackService(): Promise<SlackNotificationService | null> {
    if (this.slackService) {
      return this.slackService;
    }

    if (!this.config.integrationId) {
      return null;
    }

    try {
      this.slackService = new SlackNotificationService({
        userId: this.config.userId,
        integrationId: this.config.integrationId,
        channel: this.config.additionalConfig?.channel || this.config.additionalConfig?.defaultChannel || '#general'
      });

      return this.slackService;
    } catch (error) {
      console.error('Failed to initialize Slack service:', error);
      return null;
    }
  }

  async processActionItems(actionItems: ParsedActionItem[]): Promise<ActionProcessorResult> {
    const result: ActionProcessorResult = {
      success: true,
      processedCount: 0,
      errors: [],
      createdItems: []
    };

    try {
      const slackService = await this.getSlackService();
      if (!slackService) {
        result.success = false;
        result.errors.push('Slack service not available');
        return result;
      }

      // First, validate Slack connection
      const connectionTest = await slackService.testConnection();
      if (!connectionTest.connected) {
        result.success = false;
        result.errors.push(connectionTest.error || 'Slack connection failed');
        return result;
      }

      // Create notification message with action items
      const actionItemsList = actionItems
        .slice(0, 10) // Limit to first 10 items for readability
        .map((item, index) => {
          const priority = this.formatPriority(item.priority);
          const assignee = item.assignee ? ` (${item.assignee})` : '';
          const dueDate = item.dueDate ? ` - Due: ${item.dueDate.toLocaleDateString()}` : '';
          return `${index + 1}. ${priority}${item.text}${assignee}${dueDate}`;
        })
        .join('\n');

      const truncationNote = actionItems.length > 10 ? `\n\n_... and ${actionItems.length - 10} more action items_` : '';

      // Get project/team info for context
      let contextInfo = '';
      if (this.config.projectId) {
        const project = await db.project.findUnique({
          where: { id: this.config.projectId },
          select: { name: true, team: { select: { name: true } } }
        });
        if (project) {
          contextInfo = `\n_Project: ${project.name}${project.team ? ` (${project.team.name})` : ''}_`;
        }
      }

      const notificationPayload = {
        title: '📋 New Action Items from Meeting',
        message: `Found ${actionItems.length} action item${actionItems.length === 1 ? '' : 's'}:\n\n${actionItemsList}${truncationNote}${contextInfo}`,
        priority: 'normal' as const,
        metadata: {
          actionCount: actionItems.length,
          source: 'meeting_transcript',
          transcriptionId: this.config.transcriptionId,
          projectId: this.config.projectId,
          channel: this.config.additionalConfig?.channel
        }
      };

      // Send notification to Slack
      const notificationResult = await slackService.sendNotification(notificationPayload);

      if (notificationResult.success) {
        result.processedCount = actionItems.length;
        result.createdItems.push({
          id: notificationResult.messageId || 'slack-notification',
          title: 'Slack notification sent',
          url: `slack://channel/${this.config.additionalConfig?.defaultChannel || 'general'}`
        });

        // Send interactive buttons for bulk actions if enabled
        if (this.config.additionalConfig?.enableInteractiveButtons) {
          await this.sendInteractiveActionButtons(actionItems, slackService);
        }
      } else {
        result.success = false;
        result.errors.push(notificationResult.error || 'Failed to send Slack notification');
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Slack processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  private async sendInteractiveActionButtons(actionItems: ParsedActionItem[], slackService: SlackNotificationService) {
    try {
      const interactivePayload = {
        title: '⚡ Quick Actions',
        message: 'You can quickly manage these action items:',
        priority: 'normal' as const,
        metadata: {
          interactiveButtons: true
        }
      };

      // Note: In a full implementation, you'd create Slack blocks with interactive buttons
      // For now, we'll send a follow-up message with instructions
      await slackService.sendNotification({
        ...interactivePayload,
        message: `${interactivePayload.message}\n\n` +
          `• Use \`/expo create [description]\` to add new actions\n` +
          `• Use \`/expo list\` to see all your pending actions\n` +
          `• Mention @Exponential to create actions via chat`
      });
    } catch (error) {
      console.error('Failed to send interactive buttons:', error);
    }
  }

  private formatPriority(priority?: string): string {
    if (!priority) return '';
    
    const normalizedPriority = priority.toLowerCase();
    
    if (normalizedPriority.includes('urgent') || normalizedPriority.includes('asap')) {
      return '🔥 ';
    }
    if (normalizedPriority.includes('high') || normalizedPriority.includes('important')) {
      return '⚡ ';
    }
    if (normalizedPriority.includes('low') || normalizedPriority.includes('someday')) {
      return '🔹 ';
    }
    
    return '';
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!this.config.userId) {
      errors.push('User ID is required');
    }

    if (!this.config.integrationId) {
      errors.push('Integration ID is required for Slack processor');
    }

    // Verify the integration exists and is active
    if (this.config.integrationId) {
      const integration = await db.integration.findUnique({
        where: {
          id: this.config.integrationId,
          userId: this.config.userId,
          provider: 'slack',
          status: 'ACTIVE',
        },
        include: {
          credentials: {
            where: {
              keyType: 'BOT_TOKEN',
            },
            take: 1,
          },
        },
      });

      if (!integration) {
        errors.push('Slack integration not found or inactive');
      } else if (integration.credentials.length === 0) {
        errors.push('No bot token found for Slack integration');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async getStatus(): Promise<{ available: boolean; message?: string }> {
    try {
      const slackService = await this.getSlackService();
      if (!slackService) {
        return {
          available: false,
          message: 'Slack service not configured'
        };
      }

      const connectionTest = await slackService.testConnection();
      if (!connectionTest.connected) {
        return {
          available: false,
          message: connectionTest.error || 'Slack connection failed'
        };
      }

      return { available: true };
    } catch (error) {
      return {
        available: false,
        message: `Slack status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}