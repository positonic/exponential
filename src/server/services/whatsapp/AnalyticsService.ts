import { db } from '~/server/db';
import { cacheService } from './CacheService';

interface MessageAnalytics {
  messagesReceived: number;
  messagesSent: number;
  messagesDelivered: number;
  messagesRead: number;
  messagesFailed: number;
  uniqueUsers: Set<string>;
  responseTimes: number[];
  conversationLengths: number[];
  errors: number;
}

export class WhatsAppAnalyticsService {
  /**
   * Aggregate analytics for a specific hour
   */
  async aggregateHourlyAnalytics(
    whatsappConfigId: string,
    date: Date,
    hour: number
  ): Promise<void> {
    const startTime = new Date(date);
    startTime.setHours(hour, 0, 0, 0);
    
    const endTime = new Date(date);
    endTime.setHours(hour + 1, 0, 0, 0);

    console.log(`Aggregating analytics for ${whatsappConfigId} - ${startTime.toISOString()}`);

    try {
      // Collect metrics from various sources
      const [
        messageMetrics,
        conversationMetrics,
        errorMetrics,
      ] = await Promise.all([
        this.getMessageMetrics(whatsappConfigId, startTime, endTime),
        this.getConversationMetrics(whatsappConfigId, startTime, endTime),
        this.getErrorMetrics(whatsappConfigId, startTime, endTime),
      ]);

      // Calculate aggregated values
      const analytics: MessageAnalytics = {
        ...messageMetrics,
        ...conversationMetrics,
        errors: errorMetrics.count,
      };

      // Save to database
      await this.saveAnalytics(whatsappConfigId, date, hour, analytics);

      // Update performance metrics
      await this.updatePerformanceMetrics(whatsappConfigId);

    } catch (error) {
      console.error('Failed to aggregate analytics:', error);
      throw error;
    }
  }

  /**
   * Get message metrics for time range
   */
  private async getMessageMetrics(
    whatsappConfigId: string,
    startTime: Date,
    endTime: Date
  ) {
    const analytics: Partial<MessageAnalytics> = {
      messagesReceived: 0,
      messagesSent: 0,
      messagesDelivered: 0,
      messagesRead: 0,
      messagesFailed: 0,
      uniqueUsers: new Set<string>(),
      responseTimes: [],
    };

    // Get AI interaction history for message counts
    const interactions = await db.aiInteractionHistory.findMany({
      where: {
        platform: 'whatsapp',
        sourceId: whatsappConfigId,
        createdAt: {
          gte: startTime,
          lt: endTime,
        },
      },
      select: {
        externalUserId: true,
        responseTime: true,
        hadError: true,
        createdAt: true,
      },
    });

    // Process interactions
    interactions.forEach(interaction => {
      if (interaction.externalUserId) {
        analytics.uniqueUsers!.add(interaction.externalUserId);
      }
      
      if (interaction.hadError) {
        analytics.messagesFailed!++;
      } else {
        analytics.messagesReceived!++;
        analytics.messagesSent!++;
        
        if (interaction.responseTime) {
          analytics.responseTimes!.push(interaction.responseTime);
        }
      }
    });

    // Get template usage for delivery metrics
    const templateUsage = await db.whatsAppTemplateUsage.findMany({
      where: {
        template: {
          whatsappConfigId,
        },
        usedAt: {
          gte: startTime,
          lt: endTime,
        },
      },
      select: {
        delivered: true,
        read: true,
        status: true,
      },
    });

    templateUsage.forEach(usage => {
      if (usage.delivered) analytics.messagesDelivered!++;
      if (usage.read) analytics.messagesRead!++;
      if (usage.status === 'failed') analytics.messagesFailed!++;
    });

    return analytics;
  }

  /**
   * Get conversation metrics
   */
  private async getConversationMetrics(
    whatsappConfigId: string,
    startTime: Date,
    endTime: Date
  ) {
    const conversations = await db.whatsAppConversation.findMany({
      where: {
        whatsappConfigId,
        lastMessageAt: {
          gte: startTime,
          lt: endTime,
        },
      },
      select: {
        messages: true,
        createdAt: true,
        lastMessageAt: true,
      },
    });

    const conversationLengths: number[] = [];
    
    conversations.forEach(conv => {
      // Calculate conversation length in minutes
      const length = (conv.lastMessageAt.getTime() - conv.createdAt.getTime()) / 60000;
      conversationLengths.push(length);
    });

    return {
      conversationLengths,
      totalConversations: conversations.length,
    };
  }

  /**
   * Get error metrics
   */
  private async getErrorMetrics(
    whatsappConfigId: string,
    startTime: Date,
    endTime: Date
  ) {
    const errorCount = await db.aiInteractionHistory.count({
      where: {
        platform: 'whatsapp',
        sourceId: whatsappConfigId,
        hadError: true,
        createdAt: {
          gte: startTime,
          lt: endTime,
        },
      },
    });

    return { count: errorCount };
  }

  /**
   * Save analytics to database
   */
  private async saveAnalytics(
    whatsappConfigId: string,
    date: Date,
    hour: number,
    analytics: MessageAnalytics
  ) {
    const avgResponseTime = analytics.responseTimes.length > 0
      ? analytics.responseTimes.reduce((a, b) => a + b, 0) / analytics.responseTimes.length
      : null;

    const avgConversationLength = analytics.conversationLengths.length > 0
      ? analytics.conversationLengths.reduce((a, b) => a + b, 0) / analytics.conversationLengths.length
      : null;

    const avgMessagesPerUser = analytics.uniqueUsers.size > 0
      ? (analytics.messagesReceived + analytics.messagesSent) / analytics.uniqueUsers.size
      : null;

    const errorRate = (analytics.messagesReceived + analytics.messagesSent) > 0
      ? analytics.errors / (analytics.messagesReceived + analytics.messagesSent)
      : null;

    await db.whatsAppMessageAnalytics.upsert({
      where: {
        whatsappConfigId_date_hour: {
          whatsappConfigId,
          date: new Date(date.setHours(0, 0, 0, 0)),
          hour,
        },
      },
      update: {
        messagesReceived: analytics.messagesReceived,
        messagesSent: analytics.messagesSent,
        messagesDelivered: analytics.messagesDelivered,
        messagesRead: analytics.messagesRead,
        messagesFailed: analytics.messagesFailed,
        uniqueUsers: analytics.uniqueUsers.size,
        avgResponseTime,
        maxResponseTime: analytics.responseTimes.length > 0 ? Math.max(...analytics.responseTimes) : null,
        minResponseTime: analytics.responseTimes.length > 0 ? Math.min(...analytics.responseTimes) : null,
        avgMessagesPerUser,
        avgConversationLength,
        totalConversations: analytics.conversationLengths.length,
        errorCount: analytics.errors,
        errorRate,
      },
      create: {
        whatsappConfigId,
        date: new Date(date.setHours(0, 0, 0, 0)),
        hour,
        messagesReceived: analytics.messagesReceived,
        messagesSent: analytics.messagesSent,
        messagesDelivered: analytics.messagesDelivered,
        messagesRead: analytics.messagesRead,
        messagesFailed: analytics.messagesFailed,
        uniqueUsers: analytics.uniqueUsers.size,
        avgResponseTime,
        maxResponseTime: analytics.responseTimes.length > 0 ? Math.max(...analytics.responseTimes) : null,
        minResponseTime: analytics.responseTimes.length > 0 ? Math.min(...analytics.responseTimes) : null,
        avgMessagesPerUser,
        avgConversationLength,
        totalConversations: analytics.conversationLengths.length,
        errorCount: analytics.errors,
        errorRate,
      },
    });
  }

  /**
   * Update performance metrics
   */
  private async updatePerformanceMetrics(whatsappConfigId: string) {
    const cacheStats = cacheService.getStats();
    const memUsage = process.memoryUsage();

    await db.whatsAppPerformanceMetrics.create({
      data: {
        whatsappConfigId,
        cacheHitRate: cacheStats.hitRate * 100,
        memoryUsage: memUsage.heapUsed / 1024 / 1024, // MB
        cpuUsage: process.cpuUsage().user / 1000000, // Convert to percentage
        // Other metrics would be collected from various sources
        apiCallsCount: 0,
        apiSuccessCount: 0,
        apiErrorCount: 0,
        webhooksReceived: 0,
        webhooksProcessed: 0,
        webhooksFailed: 0,
        queueSize: 0,
        queueBacklog: 0,
        circuitBreakerTrips: 0,
      },
    });
  }

  /**
   * Process all pending analytics
   */
  async processPendingAnalytics(): Promise<void> {
    const configs = await db.whatsAppConfig.findMany({
      where: {
        integration: {
          status: 'ACTIVE',
        },
      },
    });

    for (const config of configs) {
      await this.processConfigAnalytics(config.id);
    }
  }

  /**
   * Process analytics for a specific config
   */
  private async processConfigAnalytics(whatsappConfigId: string): Promise<void> {
    // Get last processed hour
    const lastAnalytics = await db.whatsAppMessageAnalytics.findFirst({
      where: { whatsappConfigId },
      orderBy: [
        { date: 'desc' },
        { hour: 'desc' },
      ],
    });

    const now = new Date();
    const currentHour = now.getHours();
    
    let startDate: Date;
    let startHour: number;

    if (lastAnalytics) {
      startDate = new Date(lastAnalytics.date);
      startHour = lastAnalytics.hour + 1;
      
      if (startHour >= 24) {
        startDate.setDate(startDate.getDate() + 1);
        startHour = 0;
      }
    } else {
      // Start from 24 hours ago if no analytics exist
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      startHour = startDate.getHours();
    }

    // Process each hour up to current hour
    const endDate = new Date(now);
    endDate.setHours(currentHour, 0, 0, 0);

    while (startDate < endDate || (startDate.getTime() === endDate.getTime() && startHour < currentHour)) {
      await this.aggregateHourlyAnalytics(whatsappConfigId, startDate, startHour);
      
      startHour++;
      if (startHour >= 24) {
        startDate.setDate(startDate.getDate() + 1);
        startHour = 0;
      }
    }
  }

  /**
   * Get analytics summary for date range
   */
  async getAnalyticsSummary(
    whatsappConfigId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const analytics = await db.whatsAppMessageAnalytics.findMany({
      where: {
        whatsappConfigId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: [
        { date: 'asc' },
        { hour: 'asc' },
      ],
    });

    // Aggregate totals
    const totals = analytics.reduce((acc, curr) => ({
      messagesReceived: acc.messagesReceived + curr.messagesReceived,
      messagesSent: acc.messagesSent + curr.messagesSent,
      messagesDelivered: acc.messagesDelivered + curr.messagesDelivered,
      messagesRead: acc.messagesRead + curr.messagesRead,
      messagesFailed: acc.messagesFailed + curr.messagesFailed,
      uniqueUsers: acc.uniqueUsers + curr.uniqueUsers,
      totalConversations: acc.totalConversations + curr.totalConversations,
      errorCount: acc.errorCount + curr.errorCount,
    }), {
      messagesReceived: 0,
      messagesSent: 0,
      messagesDelivered: 0,
      messagesRead: 0,
      messagesFailed: 0,
      uniqueUsers: 0,
      totalConversations: 0,
      errorCount: 0,
    });

    return {
      totals,
      hourlyData: analytics,
      averages: {
        avgResponseTime: this.calculateAverage(analytics, 'avgResponseTime'),
        avgMessagesPerUser: this.calculateAverage(analytics, 'avgMessagesPerUser'),
        avgConversationLength: this.calculateAverage(analytics, 'avgConversationLength'),
        errorRate: this.calculateAverage(analytics, 'errorRate'),
      },
    };
  }

  private calculateAverage(data: any[], field: string): number | null {
    const values = data.map(d => d[field]).filter(v => v !== null);
    return values.length > 0 
      ? values.reduce((a, b) => a + b, 0) / values.length 
      : null;
  }
}

// Global analytics service instance
export const analyticsService = new WhatsAppAnalyticsService();