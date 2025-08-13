import { db } from '~/server/db';

export enum WhatsAppErrorType {
  WEBHOOK_VERIFICATION_FAILED = 'WEBHOOK_VERIFICATION_FAILED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  MISSING_PHONE_NUMBER = 'MISSING_PHONE_NUMBER',
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  CREDENTIAL_NOT_FOUND = 'CREDENTIAL_NOT_FOUND',
  MESSAGE_PROCESSING_FAILED = 'MESSAGE_PROCESSING_FAILED',
  AI_PROCESSING_FAILED = 'AI_PROCESSING_FAILED',
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface WhatsAppError {
  type: WhatsAppErrorType;
  message: string;
  details?: any;
  timestamp: Date;
  phoneNumber?: string;
  userId?: string;
  configId?: string;
}

export class WhatsAppErrorHandlingService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000;
  private static readonly ERROR_LOG_RETENTION_DAYS = 30;

  // Fallback messages for different error scenarios
  private static readonly FALLBACK_MESSAGES: Record<WhatsAppErrorType | 'DEFAULT', string> = {
    [WhatsAppErrorType.WEBHOOK_VERIFICATION_FAILED]: 
      "Unable to verify webhook. Please check your configuration.",
    [WhatsAppErrorType.INVALID_SIGNATURE]: 
      "Invalid message signature. Please ensure your webhook is properly configured.",
    [WhatsAppErrorType.MISSING_PHONE_NUMBER]: 
      "Phone number not found. Please ensure you're messaging from a registered number.",
    [WhatsAppErrorType.CONFIG_NOT_FOUND]: 
      "WhatsApp configuration not found. Please contact your administrator.",
    [WhatsAppErrorType.CREDENTIAL_NOT_FOUND]: 
      "Authentication credentials not found. Please check your integration settings.",
    [WhatsAppErrorType.MESSAGE_SEND_FAILED]: 
      "Failed to send message. Please try again later.",
    [WhatsAppErrorType.AI_PROCESSING_FAILED]: 
      "I'm having trouble understanding your message right now. Please try again in a moment.",
    [WhatsAppErrorType.MESSAGE_PROCESSING_FAILED]: 
      "Sorry, I couldn't process your message. Please try rephrasing or contact support if the issue persists.",
    [WhatsAppErrorType.RATE_LIMIT_EXCEEDED]: 
      "You're sending messages too quickly. Please wait a moment before trying again.",
    [WhatsAppErrorType.DATABASE_ERROR]: 
      "I'm experiencing technical difficulties. Please try again shortly.",
    [WhatsAppErrorType.UNKNOWN_ERROR]: 
      "Something went wrong. Please try again or contact support if the problem continues.",
    DEFAULT: 
      "I apologize, but I'm unable to process your request at the moment. Please try again later."
  };

  /**
   * Log error to database for monitoring and analytics
   */
  static async logError(error: WhatsAppError): Promise<void> {
    try {
      // Store in AI interaction history with error flag
      await db.aiInteractionHistory.create({
        data: {
          platform: 'whatsapp',
          sourceId: error.configId,
          systemUserId: error.userId,
          externalUserId: error.phoneNumber,
          userMessage: error.details?.userMessage || '',
          cleanMessage: error.details?.userMessage || '',
          aiResponse: error.message,
          hadError: true,
          errorMessage: JSON.stringify({
            type: error.type,
            message: error.message,
            details: error.details
          }),
          category: 'error',
          intent: error.type,
          createdAt: error.timestamp
        }
      });
    } catch (logError) {
      // Fallback to console if database logging fails
      console.error('Failed to log error to database:', logError);
      console.error('Original error:', error);
    }
  }

  /**
   * Get appropriate fallback message for error type
   */
  static getFallbackMessage(errorType: WhatsAppErrorType): string {
    return this.FALLBACK_MESSAGES[errorType] ?? this.FALLBACK_MESSAGES.DEFAULT;
  }

  /**
   * Retry a function with exponential backoff
   */
  static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.MAX_RETRIES,
    delayMs: number = this.RETRY_DELAY_MS
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const delay = delayMs * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Handle rate limiting with intelligent backoff
   */
  static async handleRateLimit(
    phoneNumber: string,
    configId: string
  ): Promise<boolean> {
    const now = Date.now();
    
    // Check recent message count (in-memory for now, could use Redis)
    // This is a simplified implementation
    const recentMessages = await db.aiInteractionHistory.count({
      where: {
        platform: 'whatsapp',
        externalUserId: phoneNumber,
        createdAt: {
          gte: new Date(now - 60000) // Last minute
        }
      }
    });
    
    // Allow 20 messages per minute per user
    if (recentMessages >= 20) {
      await this.logError({
        type: WhatsAppErrorType.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit exceeded',
        details: { phoneNumber, messageCount: recentMessages },
        timestamp: new Date(),
        phoneNumber,
        configId
      });
      return false;
    }
    
    return true;
  }

  /**
   * Clean up old error logs
   */
  static async cleanupOldErrors(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.ERROR_LOG_RETENTION_DAYS);
      
      await db.aiInteractionHistory.deleteMany({
        where: {
          platform: 'whatsapp',
          hadError: true,
          createdAt: {
            lt: cutoffDate
          }
        }
      });
    } catch (error) {
      console.error('Failed to cleanup old error logs:', error);
    }
  }

  /**
   * Send error alert to administrators (could integrate with monitoring service)
   */
  static async sendErrorAlert(error: WhatsAppError): Promise<void> {
    // Critical errors that need immediate attention
    const criticalErrors = [
      WhatsAppErrorType.CONFIG_NOT_FOUND,
      WhatsAppErrorType.CREDENTIAL_NOT_FOUND,
      WhatsAppErrorType.WEBHOOK_VERIFICATION_FAILED
    ];
    
    if (criticalErrors.includes(error.type)) {
      console.error('🚨 CRITICAL ERROR:', error);
      // TODO: Integrate with monitoring service (e.g., Sentry, DataDog, PagerDuty)
      // For now, just log prominently
    }
  }

  /**
   * Validate message before processing
   */
  static validateMessage(message: any): { valid: boolean; error?: string } {
    if (!message) {
      return { valid: false, error: 'Message is empty' };
    }
    
    if (typeof message.from !== 'string' || !message.from) {
      return { valid: false, error: 'Invalid sender phone number' };
    }
    
    if (message.type === 'text' && (!message.text?.body || message.text.body.length > 4096)) {
      return { valid: false, error: 'Invalid text message content' };
    }
    
    return { valid: true };
  }

  /**
   * Create error response with tracking
   */
  static createErrorResponse(
    errorType: WhatsAppErrorType,
    originalError: Error,
    context: {
      phoneNumber?: string;
      userId?: string;
      configId?: string;
      userMessage?: string;
    }
  ): WhatsAppError {
    const error: WhatsAppError = {
      type: errorType,
      message: originalError instanceof Error ? originalError.message : String(originalError),
      details: {
        ...context,
        stack: originalError instanceof Error ? originalError.stack : undefined,
        originalError: originalError instanceof Error ? originalError.toString() : originalError
      },
      timestamp: new Date(),
      ...context
    };
    
    // Log the error
    this.logError(error).catch(console.error);
    
    // Send alert if critical
    this.sendErrorAlert(error).catch(console.error);
    
    return error;
  }
}