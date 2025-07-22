import { NotificationService, NotificationPayload, NotificationResult, NotificationConfig } from './NotificationService';
import { db } from '~/server/db';

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
}

interface SlackUser {
  id: string;
  name: string;
  real_name: string;
}

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

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channel,
          text: payload.title,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message,
              },
            },
          ],
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

      // Get channels
      const channelsResponse = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const channelsData = await channelsResponse.json();
      const channels: Array<{ id: string; name: string; type: string }> = [];

      if (channelsData.ok && channelsData.channels) {
        for (const channel of channelsData.channels as SlackChannel[]) {
          channels.push({
            id: channel.id,
            name: `#${channel.name}`,
            type: channel.is_channel ? 'channel' : channel.is_group ? 'group' : 'im',
          });
        }
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
}