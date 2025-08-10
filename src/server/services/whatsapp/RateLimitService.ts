import { db } from '~/server/db';

interface RateLimitInfo {
  endpoint: string;
  limitType: 'per_second' | 'per_minute' | 'per_hour' | 'per_day';
  limitValue: number;
  currentUsage: number;
  remainingQuota: number;
  resetsAt: Date;
  windowStart: Date;
}

export class WhatsAppRateLimitService {
  private static readonly ENDPOINTS = {
    MESSAGES: '/messages',
    MEDIA: '/media',
    TEMPLATES: '/message_templates',
    PHONE_NUMBERS: '/phone_numbers',
  };

  private static readonly LIMITS = {
    MESSAGES: {
      per_second: 80,
      per_minute: 1000,
      per_hour: 36000,
      per_day: 500000,
    },
    MEDIA: {
      per_second: 50,
      per_minute: 500,
      per_hour: 18000,
      per_day: 250000,
    },
    TEMPLATES: {
      per_hour: 100,
      per_day: 1000,
    },
  };

  /**
   * Track API call and update rate limits
   */
  async trackApiCall(
    whatsappConfigId: string,
    endpoint: string,
    responseHeaders?: Headers
  ): Promise<void> {
    // Extract rate limit info from response headers if available
    const rateLimitInfo = this.extractRateLimitFromHeaders(responseHeaders);
    
    // Update all rate limit windows for this endpoint
    const limitTypes: Array<'per_second' | 'per_minute' | 'per_hour' | 'per_day'> = 
      ['per_second', 'per_minute', 'per_hour', 'per_day'];
    
    for (const limitType of limitTypes) {
      await this.updateRateLimit(whatsappConfigId, endpoint, limitType, rateLimitInfo);
    }
  }

  /**
   * Update rate limit tracking
   */
  private async updateRateLimit(
    whatsappConfigId: string,
    endpoint: string,
    limitType: string,
    headerInfo?: any
  ): Promise<void> {
    const now = new Date();
    const windowStart = this.getWindowStart(now, limitType);
    const resetsAt = this.getResetTime(windowStart, limitType);
    
    // Get limit value for this endpoint and type
    const endpointKey = this.getEndpointKey(endpoint);
    const limits = WhatsAppRateLimitService.LIMITS[endpointKey as keyof typeof WhatsAppRateLimitService.LIMITS];
    const limitValue = limits?.[limitType as keyof typeof limits] || 1000;

    try {
      const existing = await db.whatsAppRateLimitTracking.findUnique({
        where: {
          whatsappConfigId_endpoint_limitType: {
            whatsappConfigId,
            endpoint,
            limitType,
          },
        },
      });

      if (existing && existing.resetsAt > now) {
        // Update existing tracking
        await db.whatsAppRateLimitTracking.update({
          where: {
            id: existing.id,
          },
          data: {
            currentUsage: existing.currentUsage + 1,
            remainingQuota: Math.max(0, existing.remainingQuota - 1),
            updatedAt: now,
          },
        });
      } else {
        // Create new tracking window
        await db.whatsAppRateLimitTracking.upsert({
          where: {
            whatsappConfigId_endpoint_limitType: {
              whatsappConfigId,
              endpoint,
              limitType,
            },
          },
          update: {
            currentUsage: 1,
            remainingQuota: limitValue - 1,
            windowStart,
            resetsAt,
            updatedAt: now,
          },
          create: {
            whatsappConfigId,
            endpoint,
            limitType,
            limitValue,
            currentUsage: 1,
            remainingQuota: limitValue - 1,
            windowStart,
            resetsAt,
          },
        });
      }

      // Check if we should send alerts
      await this.checkAndSendAlerts(whatsappConfigId, endpoint, limitType);
    } catch (error) {
      console.error('Failed to update rate limit tracking:', error);
    }
  }

  /**
   * Check rate limit status
   */
  async checkRateLimit(
    whatsappConfigId: string,
    endpoint: string
  ): Promise<{ allowed: boolean; resetIn?: number }> {
    const tracking = await db.whatsAppRateLimitTracking.findMany({
      where: {
        whatsappConfigId,
        endpoint,
        resetsAt: {
          gt: new Date(),
        },
      },
    });

    // Check if any limit is exceeded
    for (const limit of tracking) {
      if (limit.remainingQuota <= 0) {
        return {
          allowed: false,
          resetIn: limit.resetsAt.getTime() - Date.now(),
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get current rate limit status for all endpoints
   */
  async getRateLimitStatus(whatsappConfigId: string): Promise<RateLimitInfo[]> {
    const tracking = await db.whatsAppRateLimitTracking.findMany({
      where: {
        whatsappConfigId,
        resetsAt: {
          gt: new Date(),
        },
      },
      orderBy: [
        { endpoint: 'asc' },
        { limitType: 'asc' },
      ],
    });

    return tracking.map(t => ({
      endpoint: t.endpoint,
      limitType: t.limitType as RateLimitInfo['limitType'],
      limitValue: t.limitValue,
      currentUsage: t.currentUsage,
      remainingQuota: t.remainingQuota,
      resetsAt: t.resetsAt,
      windowStart: t.windowStart,
    }));
  }

  /**
   * Check and send alerts for rate limits
   */
  private async checkAndSendAlerts(
    whatsappConfigId: string,
    endpoint: string,
    limitType: string
  ): Promise<void> {
    const tracking = await db.whatsAppRateLimitTracking.findUnique({
      where: {
        whatsappConfigId_endpoint_limitType: {
          whatsappConfigId,
          endpoint,
          limitType,
        },
      },
    });

    if (!tracking) return;

    const usagePercentage = tracking.currentUsage / tracking.limitValue;
    
    // Check if we've crossed warning threshold
    if (usagePercentage >= tracking.warningThreshold && 
        (!tracking.lastAlertAt || tracking.lastAlertAt < tracking.windowStart)) {
      await this.sendRateLimitAlert(whatsappConfigId, endpoint, limitType, 'warning', usagePercentage);
      
      await db.whatsAppRateLimitTracking.update({
        where: { id: tracking.id },
        data: { lastAlertAt: new Date() },
      });
    }
    
    // Check if we've crossed critical threshold
    if (usagePercentage >= tracking.criticalThreshold) {
      await this.sendRateLimitAlert(whatsappConfigId, endpoint, limitType, 'critical', usagePercentage);
    }
  }

  /**
   * Send rate limit alert
   */
  private async sendRateLimitAlert(
    whatsappConfigId: string,
    endpoint: string,
    limitType: string,
    severity: 'warning' | 'critical',
    usagePercentage: number
  ): Promise<void> {
    console.warn(`Rate limit ${severity} for ${endpoint} (${limitType}): ${Math.round(usagePercentage * 100)}% used`);
    
    // Here you would implement actual alerting logic
    // e.g., send email, Slack notification, etc.
  }

  /**
   * Extract rate limit info from response headers
   */
  private extractRateLimitFromHeaders(headers?: Headers): any {
    if (!headers) return null;

    return {
      limit: headers.get('X-RateLimit-Limit'),
      remaining: headers.get('X-RateLimit-Remaining'),
      reset: headers.get('X-RateLimit-Reset'),
    };
  }

  /**
   * Get window start time based on limit type
   */
  private getWindowStart(now: Date, limitType: string): Date {
    const windowStart = new Date(now);
    
    switch (limitType) {
      case 'per_second':
        windowStart.setMilliseconds(0);
        break;
      case 'per_minute':
        windowStart.setSeconds(0, 0);
        break;
      case 'per_hour':
        windowStart.setMinutes(0, 0, 0);
        break;
      case 'per_day':
        windowStart.setHours(0, 0, 0, 0);
        break;
    }
    
    return windowStart;
  }

  /**
   * Get reset time based on window start and limit type
   */
  private getResetTime(windowStart: Date, limitType: string): Date {
    const resetTime = new Date(windowStart);
    
    switch (limitType) {
      case 'per_second':
        resetTime.setSeconds(resetTime.getSeconds() + 1);
        break;
      case 'per_minute':
        resetTime.setMinutes(resetTime.getMinutes() + 1);
        break;
      case 'per_hour':
        resetTime.setHours(resetTime.getHours() + 1);
        break;
      case 'per_day':
        resetTime.setDate(resetTime.getDate() + 1);
        break;
    }
    
    return resetTime;
  }

  /**
   * Get endpoint key for limits lookup
   */
  private getEndpointKey(endpoint: string): string {
    if (endpoint.includes('/messages')) return 'MESSAGES';
    if (endpoint.includes('/media')) return 'MEDIA';
    if (endpoint.includes('/message_templates')) return 'TEMPLATES';
    return 'MESSAGES'; // Default
  }

  /**
   * Clean up old rate limit records
   */
  async cleanupOldRecords(): Promise<void> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    await db.whatsAppRateLimitTracking.deleteMany({
      where: {
        resetsAt: {
          lt: oneDayAgo,
        },
      },
    });
  }
}

// Global rate limit service instance
export const rateLimitService = new WhatsAppRateLimitService();