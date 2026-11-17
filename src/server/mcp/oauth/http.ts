/**
 * Responses for the OAuth endpoints MCP clients call directly: the well-known
 * documents, registration, token and revocation (hosted MCP Agent PRD, D9).
 * They carry no cookies and serve public clients, so they answer any origin.
 */

import { isMcpOAuthEnabled } from "./metadata";

/**
 * The per-IP budget the token and revocation endpoints share (Agent PRD, D6):
 * one definition, so the two routes can't enforce one counter differently.
 */
export const TOKEN_ENDPOINT_RATE_LIMIT = { name: "oauth-token-ip", limit: 60, windowSeconds: 60 } as const;

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

/**
 * Read a form-encoded OAuth request body (RFC 6749 §3.2, RFC 7009 §2.1): the
 * parameters, or the 400 to send. Refuses another content type, a body over
 * `maxBytes` and any parameter that appears twice.
 */
export async function readOAuthForm(req: Request, maxBytes: number): Promise<URLSearchParams | Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return oauthError(400, "invalid_request", "Send the request form-encoded (application/x-www-form-urlencoded).");
  }
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) {
    return oauthError(400, "invalid_request", "The request is too large.");
  }
  const text = await req.text();
  if (text.length > maxBytes) return oauthError(400, "invalid_request", "The request is too large.");
  const form = new URLSearchParams(text);
  for (const key of new Set(form.keys())) {
    if (form.getAll(key).length > 1) return oauthError(400, "invalid_request", `${key} appears more than once.`);
  }
  return form;
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
