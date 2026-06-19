import type { PrismaClient } from "@prisma/client";
import { ZulipNotificationService } from "~/server/services/notifications/ZulipNotificationService";

/**
 * Post a short Zulip message announcing a newly-filed Sentry bug, with a deep
 * link to the created Ticket. Reuses the existing per-workspace Zulip
 * `Integration` (provider `zulip`) — the same path the notification scheduler
 * uses — resolved by the bug product's workspace.
 *
 * This is best-effort: if no Zulip integration is configured for the workspace
 * it is a silent no-op, and any send failure is swallowed so it can never break
 * the webhook. Called only when a *new* ticket was created (recurring errors
 * that dedup onto an existing ticket do not re-notify).
 */
export interface SentryBugNotification {
  workspaceId: string;
  /** Author of the ticket (Errol) — used as the notification config's userId. */
  authorId: string;
  /** The Sentry issue title, shown in bold. */
  title: string;
  /** Deep link to the created Ticket. */
  ticketUrl: string;
  /** Link back into Sentry, if the payload carried one. */
  sentryUrl: string | null;
}

export async function notifyZulipOfSentryBug(
  db: PrismaClient,
  notification: SentryBugNotification,
): Promise<void> {
  try {
    const integration = await db.integration.findFirst({
      where: {
        provider: "zulip",
        status: "ACTIVE",
        workspaceId: notification.workspaceId,
      },
      select: { id: true },
    });
    if (!integration) {
      // No Zulip configured for this workspace — nothing to do.
      return;
    }

    const service = new ZulipNotificationService({
      userId: notification.authorId,
      integrationId: integration.id,
      // Stream falls back to the integration's default when the env knob is unset.
      channel: process.env.SENTRY_ZULIP_STREAM,
      additionalConfig: {
        topic: process.env.SENTRY_ZULIP_TOPIC ?? "Sentry bugs",
      },
    });

    const links = [`[Open ticket](${notification.ticketUrl})`];
    if (notification.sentryUrl) {
      links.push(`[View in Sentry](${notification.sentryUrl})`);
    }

    const result = await service.sendNotification({
      title: "New Sentry bug filed",
      message: `**${notification.title}**\n\n${links.join(" · ")}`,
    });
    if (!result.success) {
      console.error("[sentry webhook] Zulip notify failed:", result.error);
    }
  } catch (error) {
    console.error("[sentry webhook] Zulip notify error:", error);
  }
}
