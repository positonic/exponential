import type { PrismaClient } from "@prisma/client";
import { shouldSendEmailNotification } from "~/server/services/notifications/EmailNotificationService";
import {
  CHANNEL_LIST,
  DEFAULT_MATRIX,
  NOTIFICATION_CHANNELS,
  type NotificationCategory,
  type NotificationChannel,
} from "./constants";

/**
 * Resolve the channels a recipient should receive a given category on, from
 * their category × channel matrix (falling back to {@link DEFAULT_MATRIX} per
 * cell). The per-workspace email override suppresses Email regardless of the
 * matrix (PRD requirement).
 */
export async function resolveEnabledChannels(
  db: PrismaClient,
  userId: string,
  category: NotificationCategory,
  workspaceId: string,
): Promise<NotificationChannel[]> {
  const rows =
    (await db.notificationChannelPreference.findMany({
      where: { userId, category },
      select: { channel: true, enabled: true },
    })) ?? [];

  const byChannel = new Map(rows.map((r) => [r.channel, r.enabled]));
  const defaults = DEFAULT_MATRIX[category];

  const enabled: NotificationChannel[] = [];
  for (const channel of CHANNEL_LIST) {
    const isEnabled = byChannel.get(channel) ?? defaults?.[channel] ?? false;
    if (!isEnabled) continue;

    // Per-workspace email override is a hard suppression on top of the matrix.
    if (channel === NOTIFICATION_CHANNELS.EMAIL) {
      const allowed = await shouldSendEmailNotification(db, userId, workspaceId);
      if (!allowed) continue;
    }

    enabled.push(channel);
  }

  return enabled;
}
