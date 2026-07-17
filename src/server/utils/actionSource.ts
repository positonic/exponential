/**
 * Derive an Action's `source` from the caller's JWT token type.
 *
 * Chat-gateway callbacks (agent tools invoked from WhatsApp/Telegram/Matrix
 * conversations) authenticate with a gateway-typed JWT, so the token type is
 * the ground truth for which surface a conversation-created action came from.
 * Historically the value was hardcoded to "whatsapp" (the first gateway);
 * unknown/absent token types keep that default so existing callers are
 * unchanged.
 */
const GATEWAY_TOKEN_SOURCES: Record<string, string> = {
  "whatsapp-gateway": "whatsapp",
  "telegram-gateway": "telegram",
  "matrix-gateway": "matrix",
};

export function deriveActionSource(tokenType: string | undefined): string {
  return GATEWAY_TOKEN_SOURCES[tokenType ?? ""] ?? "whatsapp";
}
