import { NotificationService, type NotificationPayload, type NotificationResult, type NotificationConfig } from './NotificationService';
import { db } from '~/server/db';
import { TRPCError } from '@trpc/server';

interface WhatsAppContact {
  phoneNumber: string;
  name?: string;
  userId?: string;
}

interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

interface WhatsAppTemplate {
  name: string;
  language: {
    code: string;
  };
  components?: Array<{
    type: string;
    parameters: Array<{
      type: string;
      text?: string;
      image?: { link: string };
      document?: { link: string };
    }>;
  }>;
}

export class WhatsAppNotificationService extends NotificationService {
  name = 'WhatsApp';
  type = 'whatsapp';
  private accessToken?: string;
  private phoneNumberId?: string;
  private businessAccountId?: string;
  
  private static instance: WhatsAppNotificationService;

  constructor(config: NotificationConfig) {
    super(config);
  }
  
  static getInstance(): WhatsAppNotificationService {
    if (!WhatsAppNotificationService.instance) {
      WhatsAppNotificationService.instance = new WhatsAppNotificationService({
        userId: 'system',
        integrationId: undefined,
        channel: '',
      });
    }
    return WhatsAppNotificationService.instance;
  }

  private async getCredentials(): Promise<{ accessToken: string; phoneNumberId: string; businessAccountId: string } | null> {
    if (this.accessToken && this.phoneNumberId && this.businessAccountId) {
      return {
        accessToken: this.accessToken,
        phoneNumberId: this.phoneNumberId,
        businessAccountId: this.businessAccountId,
      };
    }

    if (!this.config.integrationId) {
      return null;
    }

    const integration = await db.integration.findUnique({
      where: {
        id: this.config.integrationId,
        userId: this.config.userId,
        provider: 'whatsapp',
        status: 'ACTIVE',
      },
      include: {
        credentials: true,
        whatsappConfig: true,
      },
    });

    if (!integration || !integration.whatsappConfig) {
      return null;
    }

    // Get credentials from the integration
    const accessTokenCred = integration.credentials.find(c => c.keyType === 'ACCESS_TOKEN');
    
    if (!accessTokenCred) {
      return null;
    }

    this.accessToken = accessTokenCred.key;
    this.phoneNumberId = integration.whatsappConfig.phoneNumberId;
    this.businessAccountId = integration.whatsappConfig.businessAccountId;

    return {
      accessToken: this.accessToken,
      phoneNumberId: this.phoneNumberId,
      businessAccountId: this.businessAccountId,
    };
  }

  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        return {
          success: false,
          error: 'No WhatsApp credentials found',
        };
      }

      // The channel should be a phone number
      const phoneNumber = this.config.channel;
      if (!phoneNumber) {
        return {
          success: false,
          error: 'No recipient phone number specified',
        };
      }

      // Format the message
      const message = this.formatWhatsAppMessage(payload);

      // Send the message
      const response = await this.sendTextMessage(
        credentials.phoneNumberId,
        credentials.accessToken,
        phoneNumber,
        message
      );

      // Store the outbound message for tracking
      if (response.messages[0]?.id && this.config.integrationId) {
        try {
          await db.$transaction(async (tx) => {
            // Find WhatsApp config
            const whatsappConfig = await tx.whatsAppConfig.findFirst({
              where: {
                integrationId: this.config.integrationId,
              },
            });

            if (whatsappConfig) {
              // Store the message (using the same pattern as incoming messages)
              console.log('Storing outbound WhatsApp message:', {
                configId: whatsappConfig.id,
                messageId: response.messages[0].id,
                phoneNumber: phoneNumber,
                direction: 'OUTBOUND',
                messageType: 'TEXT',
                content: { text: message },
                status: 'SENT',
              });
              
              // TODO: Call storeWhatsAppMessage via API or implement direct DB storage
            }
          });
        } catch (error) {
          // Don't fail the notification if storage fails
          console.error('Failed to store outbound WhatsApp message:', error);
        }
      }

      return {
        success: true,
        messageId: response.messages[0]?.id,
      };
    } catch (error) {
      console.error('Failed to send WhatsApp notification:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send WhatsApp notification',
      };
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.config.integrationId) {
      errors.push('Integration ID is required');
    }

    const credentials = await this.getCredentials();
    if (!credentials) {
      errors.push('No WhatsApp credentials found');
    }

    if (!this.config.channel) {
      errors.push('Recipient phone number is required');
    } else if (!this.isValidPhoneNumber(this.config.channel)) {
      errors.push('Invalid phone number format');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        return {
          connected: false,
          error: 'No WhatsApp credentials found',
        };
      }

      // Test the connection by fetching the phone number details
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}?fields=display_phone_number,verified_name`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          connected: false,
          error: error.error?.message || 'Connection test failed',
        };
      }

      return {
        connected: true,
      };
    } catch (error) {
      console.error('WhatsApp connection test failed:', error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  async getAvailableChannels(): Promise<Array<{ id: string; name: string; type: string }>> {
    try {
      if (!this.config.integrationId) {
        return [];
      }

      // Get phone number mappings for this integration
      const mappings = await db.integrationUserMapping.findMany({
        where: {
          integrationId: this.config.integrationId,
        },
        include: {
          user: true,
        },
      });

      return mappings.map(mapping => ({
        id: mapping.externalUserId, // Phone number
        name: mapping.user.name || mapping.user.email || mapping.externalUserId,
        type: 'phone',
      }));
    } catch (error) {
      console.error('Failed to get WhatsApp channels:', error);
      return [];
    }
  }

  private async sendTextMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    message: string
  ): Promise<WhatsAppMessageResponse> {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            preview_url: true,
            body: message,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send WhatsApp message');
    }

    return response.json();
  }

  async sendTemplateMessage(
    to: string,
    template: WhatsAppTemplate
  ): Promise<NotificationResult> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        return {
          success: false,
          error: 'No WhatsApp credentials found',
        };
      }

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'template',
            template: template,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || 'Failed to send template message',
        };
      }

      const data: WhatsAppMessageResponse = await response.json();
      return {
        success: true,
        messageId: data.messages[0]?.id,
      };
    } catch (error) {
      console.error('Failed to send WhatsApp template message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send template message',
      };
    }
  }

  async sendMediaMessage(
    to: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    mediaUrl: string,
    caption?: string
  ): Promise<NotificationResult> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        return {
          success: false,
          error: 'No WhatsApp credentials found',
        };
      }

      const mediaPayload: any = {
        link: mediaUrl,
      };

      if (caption && (mediaType === 'image' || mediaType === 'document' || mediaType === 'video')) {
        mediaPayload.caption = caption;
      }

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: mediaType,
            [mediaType]: mediaPayload,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || 'Failed to send media message',
        };
      }

      const data: WhatsAppMessageResponse = await response.json();
      return {
        success: true,
        messageId: data.messages[0]?.id,
      };
    } catch (error) {
      console.error('Failed to send WhatsApp media message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send media message',
      };
    }
  }

  private formatWhatsAppMessage(payload: NotificationPayload): string {
    let message = '';
    
    if (payload.title) {
      // WhatsApp supports basic formatting
      message += `*${payload.title}*\n\n`;
    }
    
    message += payload.message;
    
    // Add priority indicator if high priority
    if (payload.priority === 'high') {
      message = `🔴 ${message}`;
    }
    
    return message;
  }

  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Basic international phone number validation
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber.replace(/[\s-]/g, ''));
  }
  
  /**
   * Direct method to send a notification without going through the full notification flow
   */
  async sendNotification(
    whatsappConfigId: string,
    phoneNumber: string,
    title: string,
    message: string
  ): Promise<NotificationResult> {
    try {
      // Get WhatsApp config
      const config = await db.whatsAppConfig.findUnique({
        where: { id: whatsappConfigId },
        include: {
          integration: {
            include: {
              credentials: true,
            },
          },
        },
      });

      if (!config) {
        return {
          success: false,
          error: 'WhatsApp configuration not found',
        };
      }

      // Get credentials
      const accessToken = config.integration.credentials.find(c => c.keyType === 'ACCESS_TOKEN')?.key;
      if (!accessToken) {
        return {
          success: false,
          error: 'No access token found',
        };
      }

      // Format message
      const fullMessage = title ? `*${title}*\n\n${message}` : message;

      // Send message
      const response = await this.sendTextMessage(
        config.phoneNumberId,
        accessToken,
        phoneNumber,
        fullMessage
      );

      return {
        success: true,
        messageId: response.messages[0]?.id,
      };
    } catch (error) {
      console.error('Failed to send WhatsApp notification:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send notification',
      };
    }
  }
}