import { db } from "~/server/db";
import {
  NotificationService,
  type NotificationPayload,
  type NotificationResult,
  type NotificationConfig,
} from "./NotificationService";
import { sendPushToUser } from "./WebPushService";

/**
 * Web-push channel for the unified dispatch pipeline (ADR-0045). Wraps
 * {@link sendPushToUser} as a NotificationService so the emit loop treats Push
 * like any other channel. Reads the deep link + tag from the payload metadata.
 */
export class PushNotificationService extends NotificationService {
  name = "Push";
  type = "push";

  constructor(config: NotificationConfig) {
    super(config);
  }

  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    const meta = payload.metadata ?? {};
    const tag = typeof meta.category === "string" ? meta.category : undefined;
    const url = typeof meta.deeplink === "string" ? meta.deeplink : undefined;

    try {
      const { sent, failed } = await sendPushToUser(
        this.config.userId,
        { title: payload.title, body: payload.message, tag, url },
        db,
      );
      // No subscriptions (0/0) is a delivered no-op, not a retryable failure;
      // a genuine send error marks the delivery for cron retry.
      return failed === 0
        ? { success: true, messageId: `push:${sent}` }
        : { success: false, error: `${failed} push endpoint(s) failed` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!this.config.userId) errors.push("userId is required");
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      errors.push("VAPID keys are not configured");
    }
    return { valid: errors.length === 0, errors };
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    const count = await db.pushSubscription.count({
      where: { userId: this.config.userId },
    });
    return count > 0
      ? { connected: true }
      : { connected: false, error: "No push subscriptions for this user" };
  }
}
