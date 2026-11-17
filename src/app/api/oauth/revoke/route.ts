/**
 * `POST /api/oauth/revoke` (RFC 7009; hosted MCP Agent PRD, D9): a client
 * revokes its access or refresh token when it signs out. Form-encoded in, an
 * empty 200 out, whether or not the token was known. 404 while
 * `MCP_OAUTH_MODE` is off.
 */

import { db } from "~/server/db";
import {
  oauthError,
  publicPreflight,
  readOAuthForm,
  TOKEN_ENDPOINT_RATE_LIMIT,
  whenOAuthEnabled,
} from "~/server/mcp/oauth/http";
import { revokeToken } from "~/server/mcp/oauth/revocation";
import { checkRateLimit, clientIpFrom, tooManyRequestsInit } from "~/server/utils/rateLimit";

export const runtime = "nodejs";

/** Largest revocation request body read, in bytes. */
const MAX_BODY_BYTES = 8 * 1024;

// Revocations share the token endpoint's per-IP budget: the same clients call
// both, and an unauthenticated write needs some ceiling.
export const POST = whenOAuthEnabled(async (req: Request): Promise<Response> => {
  const limit = await checkRateLimit({ ...TOKEN_ENDPOINT_RATE_LIMIT, key: clientIpFrom(req.headers) });
  if (!limit.success) {
    const init = tooManyRequestsInit(limit);
    return oauthError(init.status, "too_many_requests", "Too many requests from this address.", init.headers);
  }

  const form = await readOAuthForm(req, MAX_BODY_BYTES);
  if (form instanceof Response) return form;

  const token = form.get("token");
  if (!token) return oauthError(400, "invalid_request", "token is required.");

  await revokeToken(db, { token, clientId: form.get("client_id") });
  return new Response(null, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*", "cache-control": "no-store" },
  });
});

export const OPTIONS = whenOAuthEnabled(() => publicPreflight("POST"));
