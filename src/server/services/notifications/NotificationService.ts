export interface NotificationPayload {
  title: string;
  message: string;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface NotificationConfig {
  userId: string;
  integrationId?: string;
  channel?: string;
  additionalConfig?: Record<string, any>;
}

export abstract class NotificationService {
  abstract name: string;
  abstract type: string;

  constructor(protected config: NotificationConfig) {}

  /**
   * Send a notification
   */
  abstract sendNotification(payload: NotificationPayload): Promise<NotificationResult>;

  /**
   * Validate the notification service configuration
   */
  abstract validateConfig(): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Test the notification service connection
   */
  abstract testConnection(): Promise<{ connected: boolean; error?: string }>;

  /**
   * Get available channels/destinations for this service
   */
  async getAvailableChannels(): Promise<Array<{ id: string; name: string; type: string }>> {
    return [];
  }

  /**
   * Format a standard message template
   */
  protected formatMessage(payload: NotificationPayload): string {
    let message = '';
    
    if (payload.title) {
      message += `*${payload.title}*\n\n`;
    }
    
    message += payload.message;
    
    return message;
  }
}