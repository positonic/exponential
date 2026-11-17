/**
 * `POST /api/oauth/token` (hosted MCP Agent PRD, D9): a public MCP client
 * exchanges an authorization code and its PKCE verifier for an access token
 * bound to `/api/mcp` and a refresh token. Form-encoded in, JSON out. 404
 * while `MCP_OAUTH_MODE` is off.
 *
 * Only the `authorization_code` grant for now; the `refresh_token` grant
 * (rotation and replay detection, D8) comes with the next ticket.
 */

import { db } from "~/server/db";
import { oauthError, publicJson, publicPreflight, whenOAuthEnabled } from "~/server/mcp/oauth/http";
import { mcpResource } from "~/server/mcp/oauth/metadata";
import { redeemAuthorizationCode } from "~/server/mcp/oauth/tokenGrant";
import { checkRateLimit, clientIpFrom, tooManyRequestsInit } from "~/server/utils/rateLimit";

export const runtime = "nodejs";

/** Largest token request body read, in bytes. */
const MAX_BODY_BYTES = 8 * 1024;

/** Token requests per IP per minute (Agent PRD, D6). */
const TOKEN_REQUESTS_PER_MINUTE = 60;

/** RFC 6749 §5.1: token responses must not be cached. */
const NO_CACHE = { Pragma: "no-cache" };

export const POST = whenOAuthEnabled(async (req: Request): Promise<Response> => {
  const limit = await checkRateLimit({
    name: "oauth-token-ip",
    key: clientIpFrom(req.headers),
    limit: TOKEN_REQUESTS_PER_MINUTE,
    windowSeconds: 60,
  });
  if (!limit.success) {
    const init = tooManyRequestsInit(limit);
    return oauthError(init.status, "too_many_requests", "Too many token requests from this address.", init.headers);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return oauthError(400, "invalid_request", "Send the token request form-encoded (application/x-www-form-urlencoded).");
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return oauthError(400, "invalid_request", "The token request is too large.");
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return oauthError(400, "invalid_request", "The token request is too large.");
  const form = new URLSearchParams(text);

  // RFC 6749 §3.2: no parameter may appear twice.
  for (const key of new Set(form.keys())) {
    if (form.getAll(key).length > 1) return oauthError(400, "invalid_request", `${key} appears more than once.`);
  }

  const grantType = form.get("grant_type");
  if (grantType !== "authorization_code") {
    return oauthError(400, "unsupported_grant_type", "Only the authorization_code grant is supported.");
  }

  const resource = form.get("resource");
  if (resource !== null && resource !== mcpResource() && resource !== `${mcpResource()}/`) {
    return oauthError(400, "invalid_target", `This server issues tokens only for ${mcpResource()}.`);
  }

  const code = form.get("code");
  const clientId = form.get("client_id");
  const redirectUri = form.get("redirect_uri");
  const codeVerifier = form.get("code_verifier");
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return oauthError(400, "invalid_request", "code, client_id, redirect_uri and code_verifier are required.");
  }

  const result = await redeemAuthorizationCode(db, { code, clientId, redirectUri, codeVerifier });
  if (!result.ok) return oauthError(400, result.error, result.description, NO_CACHE);
  return publicJson(result.tokens, { headers: NO_CACHE });
});

export const OPTIONS = whenOAuthEnabled(() => publicPreflight("POST"));
