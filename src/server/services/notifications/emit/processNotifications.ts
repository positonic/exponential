import type { PrismaClient } from "@prisma/client";
import { deliverToChannel } from "./channels";
import {
  DELIVERY_STATUS,
  MAX_DELIVERY_ATTEMPTS,
  STALE_PENDING_MS,
  type NotificationCategory,
  type NotificationChannel,
} from "./constants";
import type { NotificationContent } from "./types";

const RETRY_BATCH_SIZE = 100;

export interface ProcessResult {
  considered: number;
  sent: number;
  failed: number;
}

/**
 * Reconstruct the channel-agnostic content from a persisted Notification row so
 * a delivery can be re-attempted without the original emit context.
 */
function contentFromRow(row: {
  category: string;
  title: string;
  message: string;
  deeplink: string | null;
  metadata: unknown;
  dedupeKey: string;
}): NotificationContent {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : undefined;
  const workspaceId =
    typeof metadata?.workspaceId === "string" ? metadata.workspaceId : "";

  return {
    category: row.category as NotificationCategory,
    title: row.title,
    message: row.message,
    deeplink: row.deeplink ?? undefined,
    metadata,
    workspaceId,
    dedupeKey: row.dedupeKey,
  };
}

/**
 * Cron backstop (ADR-0045): retry any delivery that hasn't succeeded. Selects
 * failed deliveries and orphaned-pending ones (older than {@link STALE_PENDING_MS}
 * — the synchronous emit likely crashed), under the attempt cap, whose parent
 * notification is due now. Scheduled-notification *generation* is added in
 * V3/V4; V1 is retry-only.
 */
export async function retryPendingDeliveries(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<ProcessResult> {
  const staleCutoff = new Date(now.getTime() - STALE_PENDING_MS);

  const deliveries = await db.notificationDelivery.findMany({
    where: {
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
      notification: {
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
      },
      OR: [
        { status: DELIVERY_STATUS.FAILED },
        { status: DELIVERY_STATUS.PENDING, createdAt: { lt: staleCutoff } },
      ],
    },
    include: { notification: true },
    take: RETRY_BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });

  let sent = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    try {
      const outcome = await deliverToChannel({
        channel: delivery.channel as NotificationChannel,
        recipientId: delivery.notification.userId,
        content: contentFromRow(delivery.notification),
      });

      await db.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: outcome.success ? DELIVERY_STATUS.SENT : DELIVERY_STATUS.FAILED,
          attempts: { increment: 1 },
          sentAt: outcome.success ? now : null,
          lastError: outcome.success ? null : (outcome.error ?? "unknown error"),
        },
      });

      if (outcome.success) sent++;
      else failed++;
    } catch (error) {
      failed++;
      await db.notificationDelivery
        .update({
          where: { id: delivery.id },
          data: {
            status: DELIVERY_STATUS.FAILED,
            attempts: { increment: 1 },
            lastError: error instanceof Error ? error.message : "unknown error",
          },
        })
        .catch(() => undefined);
    }
  }

  return { considered: deliveries.length, sent, failed };
}
