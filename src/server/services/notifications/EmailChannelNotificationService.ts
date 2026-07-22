import { db } from "~/server/db";
import { sendNotificationEmail } from "~/server/services/EmailService";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import {
  NotificationService,
  type NotificationPayload,
  type NotificationResult,
  type NotificationConfig,
} from "./NotificationService";

const BASE_URL = process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv();

function readStr(
  meta: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = meta?.[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Email channel for the unified dispatch pipeline (ADR-0045). Renders the
 * generic notification email from the payload, resolving the recipient's
 * address and building absolute URLs from the workspace-relative deeplink. The
 * per-workspace email override is applied upstream in resolveEnabledChannels, so
 * this service only runs for channels the matrix already enabled.
 */
export class EmailChannelNotificationService extends NotificationService {
  name = "Email";
  type = "email";

  constructor(config: NotificationConfig) {
    super(config);
  }

  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const user = await db.user.findUnique({
        where: { id: this.config.userId },
        select: { email: true },
      });
      if (!user?.email) {
        // Nothing to deliver to — a no-op, not a retryable failure.
        return { success: true, messageId: "email:no-address" };
      }

      const meta = payload.metadata ?? {};
      const deeplink = readStr(meta, "deeplink");
      const workspaceSlug = readStr(meta, "workspaceSlug");
      const workspaceName = readStr(meta, "workspaceName");
      const workspaceId = readStr(meta, "workspaceId");

      await sendNotificationEmail({
        to: user.email,
        title: payload.title,
        message: payload.message,
        actionUrl: deeplink ? `${BASE_URL}${deeplink}` : undefined,
        workspaceName,
        personalSettingsUrl: `${BASE_URL}/settings/notifications`,
        workspaceSettingsUrl: workspaceSlug
          ? `${BASE_URL}/w/${workspaceSlug}/settings`
          : undefined,
        workspaceId,
      });

      return { success: true };
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
    return { valid: errors.length === 0, errors };
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    const user = await db.user.findUnique({
      where: { id: this.config.userId },
      select: { email: true },
    });
    return user?.email
      ? { connected: true }
      : { connected: false, error: "User has no email address" };
  }
}
