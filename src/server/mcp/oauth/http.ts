/**
 * Responses for the OAuth endpoints MCP clients call directly: the well-known
 * documents, registration and the token endpoint (hosted MCP Agent PRD, D9).
 * They carry no cookies and serve public clients, so they answer any origin.
 */

import { isMcpOAuthEnabled } from "./metadata";

const PUBLIC_CORS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
};

/** JSON any origin may read. */
export function publicJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...PUBLIC_CORS, ...init.headers },
  });
}

/** An OAuth error body (RFC 6749 §5.2, RFC 7591 §3.2.2). */
export function oauthError(
  status: number,
  error: string,
  description: string,
  headers?: Record<string, string>,
): Response {
  return publicJson({ error, error_description: description }, { status, headers });
}

/** A CORS preflight for a public OAuth endpoint. */
export function publicPreflight(methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...PUBLIC_CORS,
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version",
      "Access-Control-Max-Age": "600",
    },
  });
}

/** What every OAuth endpoint answers while `MCP_OAUTH_MODE` is off. */
export function oauthDisabled(): Response {
  return new Response("Not Found", { status: 404 });
}

/** Run `handler` only when OAuth is on; otherwise 404, as if the route did not exist. */
export function whenOAuthEnabled<A extends unknown[]>(
  handler: (...args: A) => Response | Promise<Response>,
): (...args: A) => Response | Promise<Response> {
  return (...args) => (isMcpOAuthEnabled() ? handler(...args) : oauthDisabled());
}
