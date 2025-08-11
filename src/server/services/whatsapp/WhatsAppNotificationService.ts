import { db } from "~/server/db";

export class WhatsAppNotificationService {
  private static instance: WhatsAppNotificationService;

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): WhatsAppNotificationService {
    if (!WhatsAppNotificationService.instance) {
      WhatsAppNotificationService.instance = new WhatsAppNotificationService();
    }
    return WhatsAppNotificationService.instance;
  }

  /**
   * Send a text message via WhatsApp
   */
  async sendMessage(
    integrationId: string,
    recipientPhone: string,
    message: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Get integration with credentials
      const integration = await db.integration.findUnique({
        where: { id: integrationId },
        include: {
          credentials: true,
          whatsappConfig: true,
        },
      });

      if (!integration || !integration.whatsappConfig) {
        return {
          success: false,
          error: 'WhatsApp integration not found',
        };
      }

      const accessToken = integration.credentials.find(
        (c) => c.keyType === 'ACCESS_TOKEN'
      )?.key;
      const phoneNumberId = integration.whatsappConfig.phoneNumberId;

      if (!accessToken || !phoneNumberId) {
        return {
          success: false,
          error: 'Missing required credentials',
        };
      }

      // Send message via WhatsApp API
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
            to: recipientPhone,
            type: 'text',
            text: {
              body: message,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('WhatsApp API error:', error);
        return {
          success: false,
          error: error.error?.message || 'Failed to send message',
        };
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data.messages?.[0]?.id,
      };
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send a template message via WhatsApp
   */
  async sendTemplate(
    integrationId: string,
    recipientPhone: string,
    templateName: string,
    language: string,
    components: string[]
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Get integration with credentials
      const integration = await db.integration.findUnique({
        where: { id: integrationId },
        include: {
          credentials: true,
          whatsappConfig: true,
        },
      });

      if (!integration || !integration.whatsappConfig) {
        return {
          success: false,
          error: 'WhatsApp integration not found',
        };
      }

      const accessToken = integration.credentials.find(
        (c) => c.keyType === 'ACCESS_TOKEN'
      )?.key;
      const phoneNumberId = integration.whatsappConfig.phoneNumberId;

      if (!accessToken || !phoneNumberId) {
        return {
          success: false,
          error: 'Missing required credentials',
        };
      }

      // Build template components
      const templateComponents = [];
      
      // Add body parameters if provided
      if (components.length > 0) {
        templateComponents.push({
          type: 'body',
          parameters: components.map((text) => ({
            type: 'text',
            text,
          })),
        });
      }

      // Send template message via WhatsApp API
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
            to: recipientPhone,
            type: 'template',
            template: {
              name: templateName,
              language: {
                code: language,
              },
              components: templateComponents,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('WhatsApp API error:', error);
        return {
          success: false,
          error: error.error?.message || 'Failed to send template',
        };
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data.messages?.[0]?.id,
      };
    } catch (error) {
      console.error('Failed to send WhatsApp template:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get message status
   */
  async getMessageStatus(
    integrationId: string,
    messageId: string
  ): Promise<{ success: boolean; status?: string; error?: string }> {
    try {
      // Get integration with credentials
      const integration = await db.integration.findUnique({
        where: { id: integrationId },
        include: {
          credentials: true,
        },
      });

      if (!integration) {
        return {
          success: false,
          error: 'WhatsApp integration not found',
        };
      }

      const accessToken = integration.credentials.find(
        (c) => c.keyType === 'ACCESS_TOKEN'
      )?.key;

      if (!accessToken) {
        return {
          success: false,
          error: 'Missing access token',
        };
      }

      // Get message status via WhatsApp API
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${messageId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('WhatsApp API error:', error);
        return {
          success: false,
          error: error.error?.message || 'Failed to get message status',
        };
      }

      const data = await response.json();
      return {
        success: true,
        status: data.status,
      };
    } catch (error) {
      console.error('Failed to get WhatsApp message status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate phone number format for WhatsApp
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // WhatsApp phone numbers should be 10-15 digits
    // and should not start with a +
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  /**
   * Format phone number for WhatsApp API
   */
  formatPhoneNumber(phoneNumber: string): string {
    // Remove any non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, '');
    
    // Ensure it doesn't start with a +
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }
    
    return cleaned;
  }
}

// Export singleton instance
export const whatsappNotificationService = WhatsAppNotificationService.getInstance();