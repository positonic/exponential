import type { PrismaClient } from "@prisma/client";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "./constants";
import type { NotificationContent } from "./types";

export interface DeliveryOutcome {
  success: boolean;
  error?: string;
}

/**
 * Deliver one notification to one channel for one recipient, best-effort and
 * synchronously. Returns the outcome so the caller can record delivery status.
 *
 * V1 handles Push inline; action 3 brings Push + Email under the
 * NotificationService factory so this becomes a uniform, branch-free loop.
 */
export async function deliverToChannel(params: {
  db: PrismaClient;
  channel: NotificationChannel;
  recipientId: string;
  content: NotificationContent;
}): Promise<DeliveryOutcome> {
  const { db, channel, recipientId, content } = params;

  switch (channel) {
    case NOTIFICATION_CHANNELS.PUSH: {
      const { failed } = await sendPushToUser(
        recipientId,
        {
          title: content.title,
          body: content.message,
          tag: content.category,
          url: content.deeplink,
        },
        db,
      );
      // No subscriptions (0/0) is a no-op success, not a retryable failure.
      // A genuine send error (non-410) marks the delivery for cron retry.
      return failed === 0
        ? { success: true }
        : { success: false, error: `${failed} push endpoint(s) failed` };
    }
    default:
      return { success: false, error: `channel '${channel}' not yet implemented` };
  }
}
