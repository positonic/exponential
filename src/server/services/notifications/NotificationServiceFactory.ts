import { type NotificationService, type NotificationConfig } from './NotificationService';
import { SlackNotificationService } from './SlackNotificationService';
import { WhatsAppNotificationService } from './WhatsAppNotificationService';
import { db } from '~/server/db';

export type NotificationServiceType = 'slack' | 'email' | 'discord' | 'whatsapp';

export class NotificationServiceFactory {
  /**
   * Create notification services based on user integrations
   */
  static async createNotificationServices(userId: string): Promise<NotificationService[]> {
    const services: NotificationService[] = [];
    
    // Get user's notification integrations
    const integrations = await db.integration.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        provider: {
          in: ['slack', 'discord', 'email', 'whatsapp']
        }
      },
      include: {
        credentials: true
      }
    });

    // Create services based on available integrations
    for (const integration of integrations) {
      const config: NotificationConfig = {
        userId,
        integrationId: integration.id,
        additionalConfig: {
          name: integration.name,
          description: integration.description,
        }
      };

      const service = await this.createService(integration.provider as NotificationServiceType, config);
      if (service) {
        services.push(service);
      }
    }

    return services;
  }

  /**
   * Create a specific notification service
   */
  static async createService(
    type: NotificationServiceType,
    config: NotificationConfig
  ): Promise<NotificationService | null> {
    switch (type) {
      case 'slack':
        return new SlackNotificationService(config);
      case 'whatsapp':
        return new WhatsAppNotificationService(config);
      case 'email':
        // TODO: Implement EmailNotificationService
        return null;
      case 'discord':
        // TODO: Implement DiscordNotificationService
        return null;
      default:
        return null;
    }
  }

  /**
   * Get available notification services for a user
   */
  static async getAvailableServices(userId: string): Promise<Array<{
    type: NotificationServiceType;
    name: string;
    available: boolean;
    requiresIntegration: boolean;
  }>> {
    const integrations = await db.integration.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        provider: {
          in: ['slack', 'discord', 'email', 'whatsapp']
        }
      }
    });

    const availableIntegrations = integrations.map(i => i.provider);

    return [
      {
        type: 'slack',
        name: 'Slack',
        available: availableIntegrations.includes('slack'),
        requiresIntegration: true,
      },
      {
        type: 'whatsapp',
        name: 'WhatsApp',
        available: availableIntegrations.includes('whatsapp'),
        requiresIntegration: true,
      },
      {
        type: 'discord',
        name: 'Discord',
        available: availableIntegrations.includes('discord'),
        requiresIntegration: true,
      },
      {
        type: 'email',
        name: 'Email',
        available: false, // Not implemented yet
        requiresIntegration: false,
      },
    ];
  }

  /**
   * Send notification using all available services
   */
  static async sendToAll(
    userId: string,
    payload: {
      title: string;
      message: string;
      priority?: 'low' | 'normal' | 'high';
      metadata?: Record<string, any>;
    }
  ): Promise<Array<{ service: string; success: boolean; error?: string }>> {
    const services = await this.createNotificationServices(userId);
    const results: Array<{ service: string; success: boolean; error?: string }> = [];

    for (const service of services) {
      try {
        const result = await service.sendNotification(payload);
        results.push({
          service: service.name,
          success: result.success,
          error: result.error,
        });
      } catch (error) {
        results.push({
          service: service.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }
}