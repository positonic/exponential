/**
 * The hosted MCP endpoint's error responses. Bodies are JSON-RPC errors with a
 * null id, the shape the MCP SDK's own transport uses for HTTP-level refusals.
 * None of them carries an `Mcp-Session-Id`: the endpoint is stateless.
 */

import { tooManyRequestsInit, type RateLimitResult } from "~/server/utils/rateLimit";

function jsonRpcError(status: number, message: string, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * 401 with a Bearer challenge (RFC 6750 §3): no error code when the request
 * carried no credential, `invalid_token` when it carried one that did not
 * authenticate (unknown, expired, revoked, or a token type this endpoint
 * refuses).
 */
export function unauthorized(hadCredential: boolean): Response {
  return jsonRpcError(401, "Unauthorized: send an External agent key or a personal API token as a Bearer token.", {
    "WWW-Authenticate": hadCredential ? 'Bearer error="invalid_token"' : "Bearer",
  });
}

/** 403 for a browser origin that is neither the app's nor listed in `MCP_ALLOWED_ORIGINS`. */
export function forbiddenOrigin(): Response {
  return jsonRpcError(403, "Forbidden: this origin may not call the MCP endpoint.", {});
}

/** 429 for a principal over its request limit, with `Retry-After`. */
export function tooManyRequests(result: RateLimitResult): Response {
  const init = tooManyRequestsInit(result);
  return jsonRpcError(init.status, "Too many requests: slow down and retry after the Retry-After interval.", init.headers);
}

/** 405 for every method but POST: there is no SSE stream to GET and no session to DELETE. */
export function methodNotAllowed(): Response {
  return jsonRpcError(405, "Method not allowed: this endpoint is stateless and accepts POST only.", {
    Allow: "POST",
  });
}
