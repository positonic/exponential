/**
 * `POST /api/oauth/token` (hosted MCP Agent PRD, D9): a public MCP client
 * exchanges an authorization code and its PKCE verifier, or a refresh token,
 * for an access token bound to `/api/mcp` and a new refresh token.
 * Form-encoded in, JSON out. 404 while `MCP_OAUTH_MODE` is off.
 */

import { db } from "~/server/db";
import {
  oauthError,
  publicJson,
  publicPreflight,
  readOAuthForm,
  TOKEN_ENDPOINT_RATE_LIMIT,
  whenOAuthEnabled,
} from "~/server/mcp/oauth/http";
import { MCP_SCOPE, mcpResource } from "~/server/mcp/oauth/metadata";
import { redeemAuthorizationCode, redeemRefreshToken } from "~/server/mcp/oauth/tokenGrant";
import { checkRateLimit, clientIpFrom, tooManyRequestsInit } from "~/server/utils/rateLimit";

export const runtime = "nodejs";

/** Largest token request body read, in bytes. */
const MAX_BODY_BYTES = 8 * 1024;

/** RFC 6749 §5.1: token responses must not be cached. */
const NO_CACHE = { Pragma: "no-cache" };

export const POST = whenOAuthEnabled(async (req: Request): Promise<Response> => {
  const limit = await checkRateLimit({ ...TOKEN_ENDPOINT_RATE_LIMIT, key: clientIpFrom(req.headers) });
  if (!limit.success) {
    const init = tooManyRequestsInit(limit);
    return oauthError(init.status, "too_many_requests", "Too many token requests from this address.", init.headers);
  }

  const form = await readOAuthForm(req, MAX_BODY_BYTES);
  if (form instanceof Response) return form;

  const grantType = form.get("grant_type");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return oauthError(400, "unsupported_grant_type", "Only the authorization_code and refresh_token grants are supported.");
  }

  const resource = form.get("resource");
  if (resource !== null && resource !== mcpResource() && resource !== `${mcpResource()}/`) {
    return oauthError(400, "invalid_target", `This server issues tokens only for ${mcpResource()}.`);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    const clientId = form.get("client_id");
    if (!refreshToken || !clientId) {
      return oauthError(400, "invalid_request", "refresh_token and client_id are required.");
    }
    // RFC 6749 §6: a refresh may narrow the scope, never widen it. There is one scope.
    const scope = form.get("scope");
    if (scope !== null && scope.split(" ").some((s) => s !== "" && s !== MCP_SCOPE)) {
      return oauthError(400, "invalid_scope", `The only scope is "${MCP_SCOPE}".`);
    }
    const refreshed = await redeemRefreshToken(db, { refreshToken, clientId });
    if (!refreshed.ok) return oauthError(400, refreshed.error, refreshed.description, NO_CACHE);
    return publicJson(refreshed.tokens, { headers: NO_CACHE });
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
