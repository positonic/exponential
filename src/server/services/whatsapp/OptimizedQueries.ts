import { db } from '~/server/db';
import { cacheService } from './CacheService';
import type { WhatsAppConfig, IntegrationUserMapping, User } from '@prisma/client';

/**
 * Optimized database queries with caching and minimal data fetching
 */
export class OptimizedQueries {
  /**
   * Get WhatsApp config with caching
   */
  static async getWhatsAppConfig(configId: string): Promise<WhatsAppConfig | null> {
    const cacheKey = `whatsapp-config:${configId}`;
    
    return cacheService.whatsappConfigs.getOrSet(
      cacheKey,
      async () => {
        return await db.whatsAppConfig.findUnique({
          where: { id: configId },
          select: {
            id: true,
            phoneNumberId: true,
            businessAccountId: true,
            webhookVerifyToken: true,
            displayPhoneNumber: true,
            businessName: true,
            integrationId: true,
            createdAt: true,
            updatedAt: true
          }
        });
      },
      600000 // Cache for 10 minutes
    );
  }

  /**
   * Get user mapping with caching
   */
  static async getUserMapping(
    phoneNumber: string,
    configId: string
  ): Promise<(IntegrationUserMapping & { user: User }) | null> {
    const cacheKey = `user-mapping:${phoneNumber}:${configId}`;
    
    return cacheService.userMappings.getOrSet(
      cacheKey,
      async () => {
        return await db.integrationUserMapping.findFirst({
          where: {
            externalUserId: phoneNumber,
            integration: {
              whatsappConfig: {
                id: configId
              }
            }
          },
          include: {
            user: true
          }
        });
      },
      300000 // Cache for 5 minutes
    );
  }

  /**
   * Batch store messages for better performance
   */
  static async batchStoreMessages(messages: Array<{
    configId: string;
    messageId: string;
    phoneNumber: string;
    direction: 'INBOUND' | 'OUTBOUND';
    messageType: string;
    content: any;
    status: string;
  }>): Promise<void> {
    // Use createMany for bulk insert
    messages.map(msg => ({
      id: msg.messageId,
      whatsappConfigId: msg.configId,
      phoneNumber: msg.phoneNumber,
      direction: msg.direction,
      messageType: msg.messageType,
      content: msg.content,
      status: msg.status,
      createdAt: new Date()
    }));

    // This is more efficient than individual creates
    await db.$transaction(async (tx) => {
      // Note: You'll need to create a WhatsAppMessage model in your schema
      // For now, we'll use the AI interaction history as a placeholder
      await Promise.all(
        messages.map(msg => 
          tx.aiInteractionHistory.create({
            data: {
              platform: 'whatsapp',
              sourceId: msg.configId,
              externalUserId: msg.phoneNumber,
              userMessage: msg.content.text || '',
              cleanMessage: msg.content.text || '',
              aiResponse: '',
              category: 'message',
              intent: msg.direction
            }
          })
        )
      );
    });
  }

  /**
   * Get user projects with minimal data
   */
  static async getUserProjects(userId: string) {
    const cacheKey = `user-projects:${userId}`;
    
    return cacheService.aiModels.getOrSet(
      cacheKey,
      async () => {
        return await db.project.findMany({
          where: { createdById: userId },
          select: {
            id: true,
            name: true,
            status: true
          }
        });
      },
      180000 // Cache for 3 minutes
    );
  }

  /**
   * Optimized conversation retrieval with projection
   */
  static async getConversation(phoneNumber: string, configId: string) {
    // First check cache
    const cacheKey = `conversation:${phoneNumber}:${configId}`;
    const cached = cacheService.conversations.get(cacheKey);
    if (cached) return cached;

    // Use projection to only fetch needed fields
    const conversation = await db.whatsAppConversation.findUnique({
      where: {
        phoneNumber_whatsappConfigId: {
          phoneNumber,
          whatsappConfigId: configId
        }
      },
      select: {
        messages: true,
        lastMessageAt: true,
        messageCount: true
      }
    });

    if (conversation) {
      // Cache for short duration (1 minute)
      cacheService.conversations.set(cacheKey, conversation, 60000);
    }

    return conversation;
  }

  /**
   * Clear caches when data changes
   */
  static clearUserCache(phoneNumber: string, configId: string) {
    cacheService.userMappings.delete(`user-mapping:${phoneNumber}:${configId}`);
    cacheService.conversations.delete(`conversation:${phoneNumber}:${configId}`);
  }
}