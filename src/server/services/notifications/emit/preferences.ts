import type { PrismaClient } from "@prisma/client";
import { shouldSendEmailNotification } from "~/server/services/notifications/EmailNotificationService";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  type NotificationCategory,
  type NotificationChannel,
} from "./constants";

/** Every channel, in stable delivery order. */
const ALL_CHANNELS: readonly NotificationChannel[] = [
  NOTIFICATION_CHANNELS.PUSH,
  NOTIFICATION_CHANNELS.EMAIL,
  NOTIFICATION_CHANNELS.MATRIX,
  NOTIFICATION_CHANNELS.WHATSAPP,
  NOTIFICATION_CHANNELS.ZULIP,
];

/**
 * Seeded fallback for the category × channel matrix — used when a user has no
 * explicit {@link NotificationChannelPreference} row for a cell. Always-on
 * channels (Push, Email) default on for high-signal categories; Summary keeps
 * push quiet. Opt-in channels (Matrix, WhatsApp, Zulip) default off everywhere,
 * so connecting a chat channel never auto-starts pings (CONTEXT: Notification
 * channel).
 */
export const DEFAULT_MATRIX: Record<
  NotificationCategory,
  Record<NotificationChannel, boolean>
> = {
  [NOTIFICATION_CATEGORIES.ASSIGNMENT]: { push: true, email: true, matrix: false, whatsapp: false, zulip: false },
  [NOTIFICATION_CATEGORIES.MENTION]: { push: true, email: true, matrix: false, whatsapp: false, zulip: false },
  [NOTIFICATION_CATEGORIES.DUE_DATE]: { push: true, email: true, matrix: false, whatsapp: false, zulip: false },
  [NOTIFICATION_CATEGORIES.SUMMARY]: { push: false, email: true, matrix: false, whatsapp: false, zulip: false },
  [NOTIFICATION_CATEGORIES.MEETING_READY]: { push: true, email: true, matrix: false, whatsapp: false, zulip: false },
};

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
  for (const channel of ALL_CHANNELS) {
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
