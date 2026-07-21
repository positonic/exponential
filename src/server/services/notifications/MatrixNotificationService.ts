import {
  NotificationService,
  type NotificationPayload,
  type NotificationResult,
  type NotificationConfig,
} from './NotificationService';

/**
 * Delivers notifications to a user's Matrix DM with the Zoe bot (V2, ADR-0043).
 *
 * Unlike Slack/WhatsApp/Zulip, this service holds NO per-user credential: the
 * bot token lives only in the gateway. It POSTs { userId, title, message } to
 * the gateway's `/notify` endpoint (gateway-secret guarded), and the gateway
 * resolves the user's canonical DM room from its in-memory mapping. So the
 * "destination" is just the userId — the same userId the gateway already maps.
 */
export class MatrixNotificationService extends NotificationService {
  name = 'Matrix';
  type = 'matrix';

  constructor(config: NotificationConfig) {
    super(config);
  }

  private gatewayUrl(): string {
    return process.env.MATRIX_GATEWAY_URL ?? 'http://localhost:4114';
  }

  private gatewaySecret(): string | undefined {
    return process.env.GATEWAY_SECRET ?? process.env.WHATSAPP_GATEWAY_SECRET;
  }

  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    const secret = this.gatewaySecret();
    if (!secret) {
      return { success: false, error: 'Gateway secret not configured' };
    }

    try {
      const res = await fetch(`${this.gatewayUrl()}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Secret': secret,
        },
        body: JSON.stringify({
          userId: this.config.userId,
          title: payload.title,
          message: payload.message,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return {
          success: false,
          error: body.error ?? `Matrix gateway returned ${res.status}`,
        };
      }

      const data = (await res.json()) as { delivered?: boolean; roomId?: string };
      return { success: !!data.delivered, messageId: data.roomId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!this.config.userId) errors.push('userId is required');
    if (!this.gatewaySecret()) errors.push('GATEWAY_SECRET is not configured');
    if (!process.env.MATRIX_GATEWAY_URL) {
      errors.push('MATRIX_GATEWAY_URL is not configured');
    }
    return { valid: errors.length === 0, errors };
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.gatewayUrl()}/health`);
      if (!res.ok) {
        return { connected: false, error: `Health check returned ${res.status}` };
      }
      const data = (await res.json()) as { matrixConnected?: boolean };
      return {
        connected: !!data.matrixConnected,
        error: data.matrixConnected ? undefined : 'Gateway is up but not connected to Matrix',
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
