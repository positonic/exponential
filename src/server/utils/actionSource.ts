import type { ActionSource } from "~/server/services/actions/schema";

/**
 * Derive an Action's `source` from the caller's JWT token type.
 *
 * Chat-gateway callbacks (agent tools invoked from WhatsApp/Telegram/Matrix
 * conversations) authenticate with a gateway-typed JWT, so the token type is
 * the ground truth for which surface a conversation-created action came from.
 *
 * Returns `undefined` for any other token type. There is deliberately no
 * default: `createAction` requires a source from the closed set, so a caller
 * that receives `undefined` must decide (or fail) explicitly rather than
 * stamping the wrong surface — the historical silent "whatsapp" fallback
 * mislabelled every non-gateway agent create.
 */
const GATEWAY_TOKEN_SOURCES: Record<string, ActionSource> = {
  "whatsapp-gateway": "whatsapp",
  "telegram-gateway": "telegram",
  "matrix-gateway": "matrix",
};

export function deriveActionSource(
  tokenType: string | undefined,
): ActionSource | undefined {
  return tokenType ? GATEWAY_TOKEN_SOURCES[tokenType] : undefined;
}
