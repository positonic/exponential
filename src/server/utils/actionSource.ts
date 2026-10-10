import { TRPCError } from "@trpc/server";
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

/**
 * The source an agent-facing procedure names for a create: a mapped gateway
 * token passes its surface; an unmapped gateway token is a bug in the
 * gateway wiring and is rejected rather than mislabelled; any other
 * principal reaching an agent tool is the agent.
 */
export function resolveAgentActionSource(tokenType: string | undefined): ActionSource {
  const mapped = deriveActionSource(tokenType);
  if (mapped) return mapped;
  if (tokenType?.endsWith("-gateway")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown gateway token type "${tokenType}": no Action source is mapped for it`,
    });
  }
  return "agent";
}
