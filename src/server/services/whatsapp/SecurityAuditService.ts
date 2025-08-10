import { db } from '~/server/db';
import type { Prisma } from '@prisma/client';

export enum SecurityEventType {
  // Authentication events
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // Verification events
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  VERIFICATION_RATE_LIMITED = 'VERIFICATION_RATE_LIMITED',
  VERIFICATION_EXPIRED = 'VERIFICATION_EXPIRED',
  
  // Suspicious activity
  SUSPICIOUS_MESSAGE_PATTERN = 'SUSPICIOUS_MESSAGE_PATTERN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  
  // Admin actions
  PHONE_MAPPING_CREATED = 'PHONE_MAPPING_CREATED',
  PHONE_MAPPING_REMOVED = 'PHONE_MAPPING_REMOVED',
  INTEGRATION_MODIFIED = 'INTEGRATION_MODIFIED',
}

export interface SecurityEventMetadata {
  phoneNumber?: string;
  userId?: string;
  integrationId?: string;
  configId?: string;
  ipAddress?: string;
  userAgent?: string;
  attemptCount?: number;
  reason?: string;
  targetUserId?: string;
  action?: string;
  oldValue?: any;
  newValue?: any;
}

export interface SecurityEvent {
  id: string;
  eventType: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  metadata: SecurityEventMetadata;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

export class WhatsAppSecurityAuditService {
  /**
   * Log a security event
   */
  static async logSecurityEvent(
    eventType: SecurityEventType,
    metadata: SecurityEventMetadata,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    try {
      // In production, this would write to a SecurityAuditLog table
      // For now, we'll log to console and store critical events
      const event: Omit<SecurityEvent, 'id'> = {
        eventType,
        severity,
        timestamp: new Date(),
        metadata,
        resolved: false,
      };

      console.log(`🔒 [SECURITY AUDIT] ${eventType}:`, {
        severity,
        ...metadata,
        timestamp: event.timestamp.toISOString(),
      });

      // For critical events, create an alert
      if (severity === 'critical') {
        await this.createSecurityAlert(eventType, metadata);
      }

      // Store in database if available
      if (metadata.integrationId) {
        await this.storeAuditLog(event, metadata.integrationId);
      }
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Create a security alert for critical events
   */
  private static async createSecurityAlert(
    eventType: SecurityEventType,
    metadata: SecurityEventMetadata
  ): Promise<void> {
    // In production, this would:
    // 1. Send email/SMS to admin
    // 2. Create a notification in the app
    // 3. Potentially trigger automated responses
    
    console.error(`🚨 CRITICAL SECURITY ALERT: ${eventType}`, metadata);
  }

  /**
   * Store audit log in database
   */
  private static async storeAuditLog(
    event: Omit<SecurityEvent, 'id'>,
    integrationId: string
  ): Promise<void> {
    try {
      // Store as integration activity
      await db.integrationActivity.create({
        data: {
          integrationId,
          type: 'SECURITY_EVENT',
          metadata: {
            eventType: event.eventType,
            severity: event.severity,
            ...event.metadata,
          } as Prisma.JsonObject,
          status: event.severity === 'critical' ? 'ERROR' : 'WARNING',
        },
      });
    } catch (error) {
      console.error('Failed to store audit log:', error);
    }
  }

  /**
   * Check for suspicious patterns in messages
   */
  static async checkSuspiciousPatterns(
    phoneNumber: string,
    message: string,
    configId: string
  ): Promise<boolean> {
    const suspiciousPatterns = [
      /\b(password|passwd|pwd)\b.*\b(send|tell|give|share)\b/i,
      /\b(api[_\s]?key|token|secret)\b.*\b(send|tell|give|share)\b/i,
      /\b(credit[_\s]?card|cc|cvv)\b.*\b\d{4}/i,
      /\b(social[_\s]?security|ssn)\b.*\b\d{3}/i,
      /\bhttps?:\/\/[^\s]+\.(tk|ml|ga|cf)/i, // Suspicious domains
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(message)) {
        await this.logSecurityEvent(
          SecurityEventType.SUSPICIOUS_MESSAGE_PATTERN,
          {
            phoneNumber,
            configId,
            reason: `Message matched pattern: ${pattern.source}`,
          },
          'high'
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Track failed verification attempts
   */
  static async trackFailedVerification(
    phoneNumber: string,
    integrationId: string,
    reason: string,
    attemptCount: number
  ): Promise<void> {
    const severity = attemptCount >= 5 ? 'high' : 'medium';
    
    await this.logSecurityEvent(
      SecurityEventType.VERIFICATION_FAILED,
      {
        phoneNumber,
        integrationId,
        reason,
        attemptCount,
      },
      severity
    );

    // Block after too many attempts
    if (attemptCount >= 10) {
      await this.blockPhoneNumber(phoneNumber, integrationId);
    }
  }

  /**
   * Block a phone number
   */
  static async blockPhoneNumber(
    phoneNumber: string,
    integrationId: string
  ): Promise<void> {
    // In production, maintain a blocklist
    await this.logSecurityEvent(
      SecurityEventType.UNAUTHORIZED_ACCESS,
      {
        phoneNumber,
        integrationId,
        reason: 'Phone number blocked due to excessive failed attempts',
      },
      'critical'
    );
  }

  /**
   * Get security events for an integration
   */
  static async getSecurityEvents(
    integrationId: string,
    options: {
      eventTypes?: SecurityEventType[];
      severity?: string[];
      resolved?: boolean;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): Promise<SecurityEvent[]> {
    const activities = await db.integrationActivity.findMany({
      where: {
        integrationId,
        type: 'SECURITY_EVENT',
        ...(options.startDate && {
          createdAt: {
            gte: options.startDate,
            ...(options.endDate && { lte: options.endDate }),
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit || 100,
    });

    return activities
      .map(activity => {
        const metadata = activity.metadata as any;
        if (!metadata?.eventType) return null;

        const event: SecurityEvent = {
          id: activity.id,
          eventType: metadata.eventType,
          severity: metadata.severity || 'medium',
          timestamp: activity.createdAt,
          metadata,
          resolved: false,
        };

        // Filter by options
        if (options.eventTypes && !options.eventTypes.includes(event.eventType)) {
          return null;
        }
        if (options.severity && !options.severity.includes(event.severity)) {
          return null;
        }

        return event;
      })
      .filter(Boolean) as SecurityEvent[];
  }

  /**
   * Generate security report
   */
  static async generateSecurityReport(
    integrationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    summary: Record<SecurityEventType, number>;
    criticalEvents: SecurityEvent[];
    topPhoneNumbers: Array<{ phoneNumber: string; count: number }>;
    recommendations: string[];
  }> {
    const events = await this.getSecurityEvents(integrationId, {
      startDate,
      endDate,
    });

    // Count events by type
    const summary = events.reduce((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {} as Record<SecurityEventType, number>);

    // Get critical events
    const criticalEvents = events.filter(e => e.severity === 'critical');

    // Count events by phone number
    const phoneNumberCounts = new Map<string, number>();
    events.forEach(event => {
      if (event.metadata.phoneNumber) {
        const count = phoneNumberCounts.get(event.metadata.phoneNumber) || 0;
        phoneNumberCounts.set(event.metadata.phoneNumber, count + 1);
      }
    });

    const topPhoneNumbers = Array.from(phoneNumberCounts.entries())
      .map(([phoneNumber, count]) => ({ phoneNumber, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (summary[SecurityEventType.UNAUTHORIZED_ACCESS] > 5) {
      recommendations.push('Consider implementing stricter phone number verification');
    }
    
    if (summary[SecurityEventType.RATE_LIMIT_EXCEEDED] > 10) {
      recommendations.push('Review rate limiting thresholds');
    }
    
    if (summary[SecurityEventType.SUSPICIOUS_MESSAGE_PATTERN] > 0) {
      recommendations.push('Enable automated message filtering for sensitive data');
    }
    
    if (criticalEvents.length > 0) {
      recommendations.push('Review and address critical security events immediately');
    }

    return {
      summary,
      criticalEvents,
      topPhoneNumbers,
      recommendations,
    };
  }

  /**
   * Check if phone number is blocked
   */
  static async isPhoneNumberBlocked(
    phoneNumber: string,
    integrationId: string
  ): Promise<boolean> {
    // Check recent critical events for this phone number
    const recentEvents = await this.getSecurityEvents(integrationId, {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      eventTypes: [SecurityEventType.UNAUTHORIZED_ACCESS],
      severity: ['critical'],
    });

    return recentEvents.some(
      event => 
        event.metadata.phoneNumber === phoneNumber &&
        event.metadata.reason?.includes('blocked')
    );
  }
}