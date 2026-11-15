import { safeSignatureEquals } from "~/server/utils/webhookSignature";

/**
 * The header on which the Mastra server presents `MASTRA_SERVER_API_KEY`,
 * the secret it shares with this app, when it calls back for something only
 * the server itself may have (a workspace's model key).
 *
 * The usual callback credential is the agent JWT in `Authorization`, which
 * proves which user a turn is for. That token also travels in the agent's
 * request context, so on its own it does not prove the caller is the Mastra
 * server. This second header does.
 */
export const MASTRA_SERVER_KEY_HEADER = "x-mastra-server-key";

/**
 * True when the request carries the shared server key. Fails closed: with no
 * `MASTRA_SERVER_API_KEY` configured, nothing is the Mastra server.
 */
export function isMastraServerRequest(
  headers: Headers,
  env: Partial<Record<string, string | undefined>> = process.env,
): boolean {
  const expected = env.MASTRA_SERVER_API_KEY;
  const provided = headers.get(MASTRA_SERVER_KEY_HEADER);
  if (!expected || !provided) return false;
  return safeSignatureEquals(provided, expected);
}
