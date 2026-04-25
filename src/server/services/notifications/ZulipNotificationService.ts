import {
  NotificationService,
  type NotificationPayload,
  type NotificationResult,
  type NotificationConfig,
} from "./NotificationService";
import { db } from "~/server/db";
import { getDecryptedKey } from "~/server/utils/credentialHelper";

interface ZulipCredentials {
  serverUrl: string;
  botEmail: string;
  apiToken: string;
  defaultStream?: string;
  defaultTopic?: string;
}

interface ZulipApiResponse {
  result: "success" | "error";
  msg: string;
  id?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export class ZulipNotificationService extends NotificationService {
  name = "Zulip";
  type = "zulip";
  private cachedCredentials?: ZulipCredentials | null;

  constructor(config: NotificationConfig) {
    super(config);
  }

  private getAuthHeader(botEmail: string, apiToken: string): string {
    return `Basic ${Buffer.from(`${botEmail}:${apiToken}`).toString("base64")}`;
  }

  private async getCredentials(): Promise<ZulipCredentials | null> {
    if (this.cachedCredentials !== undefined) {
      return this.cachedCredentials;
    }

    if (!this.config.integrationId) {
      this.cachedCredentials = null;
      return null;
    }

    const integration = await db.integration.findUnique({
      where: {
        id: this.config.integrationId,
        provider: "zulip",
        status: "ACTIVE",
      },
      include: {
        credentials: true,
      },
    });

    if (!integration || integration.credentials.length === 0) {
      this.cachedCredentials = null;
      return null;
    }

    const serverUrlCred = integration.credentials.find(
      (c) => c.keyType === "SERVER_URL",
    );
    const botEmailCred = integration.credentials.find(
      (c) => c.keyType === "BOT_EMAIL",
    );
    const apiTokenCred = integration.credentials.find(
      (c) => c.keyType === "API_TOKEN",
    );
    const defaultStreamCred = integration.credentials.find(
      (c) => c.keyType === "DEFAULT_STREAM",
    );
    const defaultTopicCred = integration.credentials.find(
      (c) => c.keyType === "DEFAULT_TOPIC",
    );

    if (!serverUrlCred || !botEmailCred || !apiTokenCred) {
      this.cachedCredentials = null;
      return null;
    }

    const apiToken = getDecryptedKey(apiTokenCred);
    if (!apiToken) {
      this.cachedCredentials = null;
      return null;
    }

    this.cachedCredentials = {
      serverUrl: serverUrlCred.key.replace(/\/+$/, ""),
      botEmail: botEmailCred.key,
      apiToken,
      defaultStream: defaultStreamCred?.key,
      defaultTopic: defaultTopicCred?.key,
    };

    return this.cachedCredentials;
  }

  async sendNotification(
    payload: NotificationPayload,
  ): Promise<NotificationResult> {
    try {
      const creds = await this.getCredentials();
      if (!creds) {
        return { success: false, error: "No Zulip credentials found" };
      }

      const stream =
        this.config.channel ?? creds.defaultStream ?? "general";
      const topic =
        this.config.additionalConfig?.topic ??
        creds.defaultTopic ??
        "Notifications";
      const content = this.formatZulipMessage(payload);

      const response = await fetch(
        `${creds.serverUrl}/api/v1/messages`,
        {
          method: "POST",
          headers: {
            Authorization: this.getAuthHeader(creds.botEmail, creds.apiToken),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            type: "channel",
            to: stream,
            topic,
            content,
          }),
        },
      );

      const data = (await response.json()) as ZulipApiResponse;

      if (data.result !== "success") {
        return {
          success: false,
          error: data.msg ?? "Failed to send Zulip message",
        };
      }

      return { success: true, messageId: String(data.id) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send a direct message to a Zulip user by their email address.
   */
  async sendDirectMessage(
    recipientEmail: string,
    payload: NotificationPayload,
  ): Promise<NotificationResult> {
    try {
      const creds = await this.getCredentials();
      if (!creds) {
        return { success: false, error: "No Zulip credentials found" };
      }

      const content = this.formatZulipMessage(payload);

      const response = await fetch(
        `${creds.serverUrl}/api/v1/messages`,
        {
          method: "POST",
          headers: {
            Authorization: this.getAuthHeader(creds.botEmail, creds.apiToken),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            type: "direct",
            to: JSON.stringify([recipientEmail]),
            content,
          }),
        },
      );

      const data = (await response.json()) as ZulipApiResponse;

      if (data.result !== "success") {
        return {
          success: false,
          error: data.msg ?? "Failed to send Zulip DM",
        };
      }

      return { success: true, messageId: String(data.id) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send a DM to an Exponential user by looking up their Zulip email
   * via IntegrationUserMapping. No-ops if user has no mapping.
   */
  async sendNotificationToUser(
    userId: string,
    payload: NotificationPayload,
  ): Promise<NotificationResult> {
    if (!this.config.integrationId) {
      return { success: false, error: "No integration ID configured" };
    }

    const mapping = await db.integrationUserMapping.findFirst({
      where: {
        integrationId: this.config.integrationId,
        userId,
      },
    });

    if (!mapping) {
      // User not mapped — skip silently
      return { success: true };
    }

    return this.sendDirectMessage(mapping.externalUserId, payload);
  }

  private formatZulipMessage(payload: NotificationPayload): string {
    let message = "";

    const emoji = this.getPriorityEmoji(payload.priority);
    if (payload.title) {
      message += `${emoji} **${payload.title}**\n\n`;
    }

    message += payload.message;

    if (payload.metadata) {
      const entries = Object.entries(payload.metadata)
        .filter(([_, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `**${key}:** ${String(value)}`);

      if (entries.length > 0) {
        message += `\n\n*${entries.join(" | ")}*`;
      }
    }

    return message;
  }

  private getPriorityEmoji(priority?: string): string {
    switch (priority) {
      case "high":
        return "\u{1F525}";
      case "normal":
        return "\u{1F4CB}";
      case "low":
        return "\u{1F4AC}";
      default:
        return "\u{1F4CB}";
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.config.userId) {
      errors.push("User ID is required");
    }

    if (!this.config.integrationId) {
      errors.push("Integration ID is required for Zulip notifications");
    }

    const creds = await this.getCredentials();
    if (!creds) {
      errors.push("No valid Zulip credentials found");
    }

    return { valid: errors.length === 0, errors };
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const creds = await this.getCredentials();
      if (!creds) {
        return { connected: false, error: "No credentials available" };
      }

      const response = await fetch(
        `${creds.serverUrl}/api/v1/users/me`,
        {
          method: "GET",
          headers: {
            Authorization: this.getAuthHeader(creds.botEmail, creds.apiToken),
          },
        },
      );

      const data = (await response.json()) as ZulipApiResponse;

      if (data.result !== "success") {
        return {
          connected: false,
          error: data.msg ?? "Zulip authentication failed",
        };
      }

      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Connection test failed",
      };
    }
  }

  async getAvailableChannels(): Promise<
    Array<{ id: string; name: string; type: string }>
  > {
    try {
      const creds = await this.getCredentials();
      if (!creds) return [];

      const response = await fetch(
        `${creds.serverUrl}/api/v1/streams`,
        {
          method: "GET",
          headers: {
            Authorization: this.getAuthHeader(creds.botEmail, creds.apiToken),
          },
        },
      );

      const data = (await response.json()) as ZulipApiResponse;

      if (data.result !== "success" || !Array.isArray(data.streams)) {
        return [];
      }

      return (data.streams as Array<{ stream_id: number; name: string; invite_only: boolean }>)
        .map((s) => ({
          id: String(s.stream_id),
          name: s.name,
          type: s.invite_only ? "private" : "public",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error("Failed to get Zulip channels:", error);
      return [];
    }
  }
}

/**
 * Test a Zulip connection with raw credentials (used before integration is saved).
 */
export async function testZulipConnection(
  serverUrl: string,
  botEmail: string,
  apiToken: string,
): Promise<{
  success: boolean;
  error?: string;
  botInfo?: { email: string; full_name: string; user_id: number };
}> {
  try {
    const normalizedUrl = serverUrl.replace(/\/+$/, "");
    const response = await fetch(`${normalizedUrl}/api/v1/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${botEmail}:${apiToken}`).toString("base64")}`,
      },
    });

    const data = (await response.json()) as ZulipApiResponse;

    if (data.result !== "success") {
      return { success: false, error: data.msg ?? "Authentication failed" };
    }

    return {
      success: true,
      botInfo: {
        email: data.email as string,
        full_name: data.full_name as string,
        user_id: data.user_id as number,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Fetch all users from a Zulip organization.
 */
export async function fetchZulipUsers(
  serverUrl: string,
  botEmail: string,
  apiToken: string,
): Promise<
  Array<{ user_id: number; email: string; full_name: string; is_bot: boolean }>
> {
  const normalizedUrl = serverUrl.replace(/\/+$/, "");
  const response = await fetch(`${normalizedUrl}/api/v1/users`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${botEmail}:${apiToken}`).toString("base64")}`,
    },
  });

  const data = (await response.json()) as ZulipApiResponse;

  if (data.result !== "success" || !Array.isArray(data.members)) {
    return [];
  }

  return (data.members as Array<{ user_id: number; email: string; full_name: string; is_bot: boolean; is_active: boolean }>)
    .filter((m) => m.is_active && !m.is_bot)
    .map((m) => ({
      user_id: m.user_id,
      email: m.email,
      full_name: m.full_name,
      is_bot: m.is_bot,
    }));
}

/**
 * Fetch streams from a Zulip organization.
 */
export async function fetchZulipStreams(
  serverUrl: string,
  botEmail: string,
  apiToken: string,
): Promise<Array<{ stream_id: number; name: string; invite_only: boolean }>> {
  const normalizedUrl = serverUrl.replace(/\/+$/, "");
  const response = await fetch(`${normalizedUrl}/api/v1/streams`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${botEmail}:${apiToken}`).toString("base64")}`,
    },
  });

  const data = (await response.json()) as ZulipApiResponse;

  if (data.result !== "success" || !Array.isArray(data.streams)) {
    return [];
  }

  return (data.streams as Array<{ stream_id: number; name: string; invite_only: boolean }>)
    .sort((a, b) => a.name.localeCompare(b.name));
}
