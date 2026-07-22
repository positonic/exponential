import {
  NotificationServiceFactory,
  type NotificationServiceType,
} from "~/server/services/notifications/NotificationServiceFactory";
import type { NotificationChannel } from "./constants";
import type { NotificationContent } from "./types";

export interface DeliveryOutcome {
  success: boolean;
  error?: string;
}

/**
 * Deliver one notification to one channel for one recipient, best-effort and
 * synchronously. Every channel — Push, Email, Matrix, WhatsApp, Zulip — is a
 * NotificationService behind the factory, so this loop has no per-channel
 * branches. Returns the outcome so the caller records delivery status.
 */
export async function deliverToChannel(params: {
  channel: NotificationChannel;
  recipientId: string;
  content: NotificationContent;
}): Promise<DeliveryOutcome> {
  const { channel, recipientId, content } = params;

  try {
    const service = await NotificationServiceFactory.createService(
      channel as NotificationServiceType,
      { userId: recipientId },
    );
    if (!service) {
      return { success: false, error: `no service for channel '${channel}'` };
    }

    const result = await service.sendNotification({
      title: content.title,
      message: content.message,
      priority: "normal",
      metadata: {
        ...content.metadata,
        category: content.category,
        deeplink: content.deeplink,
        workspaceId: content.workspaceId,
      },
    });

    return { success: result.success, error: result.error };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
