import type { Prisma } from "@prisma/client";
import { DELIVERY_STATUS } from "./constants";
import { filterRecipientsByAccess } from "./access";
import { deliverToChannel } from "./channels";
import { buildContent } from "./content";
import { resolveEnabledChannels } from "./preferences";
import { resolveRecipients } from "./recipients";
import type { EmitNotificationInput } from "./types";

export type { EmitNotificationInput } from "./types";

/**
 * The single seam every notification flows through (ADR-0045).
 *
 * On emit: resolve recipients per the category rule, drop the actor, then for
 * each recipient persist a durable Notification, resolve their enabled channels,
 * write a NotificationDelivery per channel, and attempt best-effort synchronous
 * delivery — recording the per-channel outcome. Failures stay for the
 * `/api/cron/process-notifications` worker to retry.
 *
 * Fire-and-forget: callers `void` this; it never throws.
 */
export async function emitNotification(input: EmitNotificationInput): Promise<void> {
  const { actorUserId } = input;

  try {
    // Never notify the acting user about their own action, and never notify a
    // recipient who can no longer access the item.
    const candidates = (await resolveRecipients(input)).filter(
      (id) => id !== actorUserId,
    );
    const recipientIds = await filterRecipientsByAccess(input, candidates);

    for (const recipientId of recipientIds) {
      try {
        await emitForRecipient(input, recipientId);
      } catch (error) {
        console.error(
          `[emitNotification] recipient ${recipientId} (${input.category}) failed:`,
          error,
        );
      }
    }
  } catch (error) {
    console.error(`[emitNotification] ${input.category} failed:`, error);
  }
}

async function emitForRecipient(
  input: EmitNotificationInput,
  recipientId: string,
): Promise<void> {
  const { db } = input;

  const content = await buildContent(input, recipientId);
  if (!content) return;

  // Dedup: the same (event, recipient) never notifies twice. The unique index
  // on (dedupeKey, userId) is the backstop against races; this guard skips the
  // common replay/double-fire case cleanly without throwing.
  const existing = await db.notification.findUnique({
    where: {
      dedupeKey_userId: { dedupeKey: content.dedupeKey, userId: recipientId },
    },
    select: { id: true },
  });
  if (existing) return;

  const notification = await db.notification.create({
    data: {
      userId: recipientId,
      category: content.category,
      title: content.title,
      message: content.message,
      deeplink: content.deeplink,
      metadata: (content.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      dedupeKey: content.dedupeKey,
      scheduledFor: input.scheduledFor ?? null,
    },
  });

  // Resolve the recipient's enabled channels from their category × channel
  // matrix (seeded defaults + per-workspace email override). Only enabled
  // channels get a delivery row.
  const channels = await resolveEnabledChannels(
    db,
    recipientId,
    content.category,
    content.workspaceId,
  );

  const isFuture =
    notification.scheduledFor != null &&
    notification.scheduledFor.getTime() > Date.now();

  for (const channel of channels) {
    const delivery = await db.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel,
        status: DELIVERY_STATUS.PENDING,
      },
    });

    // Scheduled-for-the-future notifications are left pending for the cron.
    if (isFuture) continue;

    const outcome = await deliverToChannel({
      channel,
      recipientId,
      content,
    });

    await db.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: outcome.success ? DELIVERY_STATUS.SENT : DELIVERY_STATUS.FAILED,
        attempts: { increment: 1 },
        sentAt: outcome.success ? new Date() : null,
        lastError: outcome.success ? null : (outcome.error ?? "unknown error"),
      },
    });
  }
}
