import { NotificationService, type NotificationPayload, type NotificationResult, type NotificationConfig } from './NotificationService';
import { db } from '~/server/db';

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
}

// interface SlackUser {
//   id: string;
//   name: string;
//   real_name: string;
// }

export class SlackNotificationService extends NotificationService {
  name = 'Slack';
  type = 'slack';
  private botToken?: string;

  constructor(config: NotificationConfig) {
    super(config);
  }

  private async getBotToken(): Promise<string | null> {
    if (this.botToken) {
      return this.botToken;
    }

    if (!this.config.integrationId) {
      return null;
    }

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

    if (!integration || integration.credentials.length === 0) {
      return null;
    }

    this.botToken = integration.credentials[0]!.key;
    return this.botToken;
  }

  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const token = await this.getBotToken();
      if (!token) {
        return {
          success: false,
          error: 'No Slack bot token found',
        };
      }

      const channel = this.config.channel || '#general';
      const message = this.formatSlackMessage(payload);

      const blocks = this.createSlackBlocks(payload, message);
      
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channel,
          text: payload.title, // Fallback for notifications
          blocks: blocks,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        return {
          success: false,
          error: data.error || 'Failed to send Slack message',
        };
      }

      return {
        success: true,
        messageId: data.ts,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private formatSlackMessage(payload: NotificationPayload): string {
    let message = '';
    
    // Add emoji based on priority
    const emoji = this.getPriorityEmoji(payload.priority);
    if (payload.title) {
      message += `${emoji} *${payload.title}*\n\n`;
    }
    
    message += payload.message;
    
    // Add metadata as thread or footer if present
    if (payload.metadata) {
      const metadataEntries = Object.entries(payload.metadata)
        .filter(([_, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `*${key}:* ${value}`);
      
      if (metadataEntries.length > 0) {
        message += `\n\n_${metadataEntries.join(' | ')}_`;
      }
    }
    
    return message;
  }

  private createSlackBlocks(payload: NotificationPayload, _message: string): any[] {
    const blocks: any[] = [];
    
    // Header section with title and emoji
    const emoji = this.getPriorityEmoji(payload.priority);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${payload.title}*`
      }
    });

    // Main message content
    if (payload.message) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: payload.message
        }
      });
    }

    // Add interactive buttons for action items if metadata indicates it
    if (payload.metadata?.interactiveButtons || payload.metadata?.actionCount) {
      blocks.push({
        type: 'divider'
      });

      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📋 View All Actions'
            },
            style: 'primary',
            action_id: 'view_all_actions',
            url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/inbox`
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '➕ Create Action'
            },
            action_id: 'create_action_modal',
            value: JSON.stringify({
              userId: this.config.userId,
              transcriptionId: payload.metadata?.transcriptionId
            })
          }
        ]
      });
    }

    // Add metadata context section
    if (payload.metadata && Object.keys(payload.metadata).length > 0) {
      const contextElements = [];
      
      if (payload.metadata.actionCount) {
        contextElements.push(`📊 ${payload.metadata.actionCount} action items`);
      }
      
      if (payload.metadata.source) {
        contextElements.push(`📝 Source: ${payload.metadata.source}`);
      }

      if (contextElements.length > 0) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: contextElements.join(' • ')
            }
          ]
        });
      }
    }

    return blocks;
  }

  private getPriorityEmoji(priority?: string): string {
    switch (priority) {
      case 'high':
        return '🔥';
      case 'normal':
        return '📋';
      case 'low':
        return '💬';
      default:
        return '📋';
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!this.config.userId) {
      errors.push('User ID is required');
    }

    if (!this.config.integrationId) {
      errors.push('Integration ID is required for Slack notifications');
    }

    const token = await this.getBotToken();
    if (!token) {
      errors.push('No valid Slack bot token found');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const token = await this.getBotToken();
      if (!token) {
        return {
          connected: false,
          error: 'No bot token available',
        };
      }

      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.ok) {
        return {
          connected: false,
          error: data.error || 'Slack authentication failed',
        };
      }

      return {
        connected: true,
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  async getAvailableChannels(): Promise<Array<{ id: string; name: string; type: string }>> {
    try {
      const token = await this.getBotToken();
      if (!token) {
        return [];
      }

      // Get channels - include more types and only channels the bot can access
      const channelsResponse = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=1000', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const channelsData = await channelsResponse.json();
      const channels: Array<{ id: string; name: string; type: string }> = [];

      if (channelsData.ok && channelsData.channels) {
        for (const channel of channelsData.channels as SlackChannel[]) {
          // Only include channels where the bot is a member or public channels
          channels.push({
            id: channel.id,
            name: `#${channel.name}`,
            type: channel.is_channel ? 'public' : channel.is_group ? 'private' : 'im',
          });
        }
      } else {
        console.error('Failed to fetch Slack channels:', channelsData.error);
      }

      // Get DMs/Users (optional, can be heavy)
      // const usersResponse = await fetch('https://slack.com/api/users.list', {
      //   headers: {
      //     'Authorization': `Bearer ${token}`,
      //   },
      // });

      // const usersData = await usersResponse.json();
      // if (usersData.ok && usersData.members) {
      //   for (const user of usersData.members as SlackUser[]) {
      //     if (!user.deleted && user.id !== 'USLACKBOT') {
      //       channels.push({
      //         id: user.id,
      //         name: `@${user.name}`,
      //         type: 'user',
      //       });
      //     }
      //   }
      // }

      return channels.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Failed to get Slack channels:', error);
      return [];
    }
  }

  /**
   * Send a threaded reply to an existing message
   */
  async sendThreadReply(
    originalMessageTs: string, 
    replyText: string, 
    channel?: string
  ): Promise<NotificationResult> {
    try {
      const token = await this.getBotToken();
      if (!token) {
        return {
          success: false,
          error: 'No Slack bot token found',
        };
      }

      const targetChannel = channel || this.config.channel || '#general';

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: targetChannel,
          text: replyText,
          thread_ts: originalMessageTs,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        return {
          success: false,
          error: data.error || 'Failed to send thread reply',
        };
      }

      return {
        success: true,
        messageId: data.ts,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update an existing message with new content
   */
  async updateMessage(
    messageTs: string,
    newText: string,
    channel?: string,
    blocks?: any[]
  ): Promise<NotificationResult> {
    try {
      const token = await this.getBotToken();
      if (!token) {
        return {
          success: false,
          error: 'No Slack bot token found',
        };
      }

      const targetChannel = channel || this.config.channel || '#general';

      const body: any = {
        channel: targetChannel,
        ts: messageTs,
        text: newText,
      };

      if (blocks && blocks.length > 0) {
        body.blocks = blocks;
      }

      const response = await fetch('https://slack.com/api/chat.update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.ok) {
        return {
          success: false,
          error: data.error || 'Failed to update message',
        };
      }

      return {
        success: true,
        messageId: data.ts,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send action status update to a thread
   */
  async sendActionStatusUpdate(
    originalMessageTs: string,
    actionTitle: string,
    status: 'completed' | 'in_progress' | 'snoozed',
    channel?: string
  ): Promise<NotificationResult> {
    const statusEmoji = {
      completed: '✅',
      in_progress: '⏳',
      snoozed: '⏰'
    }[status];

    const statusText = {
      completed: 'completed',
      in_progress: 'is in progress',
      snoozed: 'was snoozed'
    }[status];

    const replyText = `${statusEmoji} *${actionTitle}* ${statusText}`;
    
    return this.sendThreadReply(originalMessageTs, replyText, channel);
  }
}