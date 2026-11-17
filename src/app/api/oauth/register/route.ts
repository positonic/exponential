/**
 * `POST /api/oauth/register`: dynamic client registration (RFC 7591) for MCP
 * clients (hosted MCP Agent PRD, D9). A client posts its name and redirect
 * URIs and gets a `client_id`; no secret is ever issued. 404 while
 * `MCP_OAUTH_MODE` is off.
 */

import { db } from "~/server/db";
import { oauthError, publicJson, publicPreflight, whenOAuthEnabled } from "~/server/mcp/oauth/http";
import { parseRegistration, registrationResponse } from "~/server/mcp/oauth/registration";
import { checkRateLimit, clientIpFrom, tooManyRequestsInit } from "~/server/utils/rateLimit";

export const runtime = "nodejs";

/** Largest registration body read, in bytes; real ones are a few hundred. */
const MAX_BODY_BYTES = 16 * 1024;

/** Registrations per IP per hour (Agent PRD, open question 4 and D6). */
const REGISTRATIONS_PER_HOUR = 20;

export const POST = whenOAuthEnabled(async (req: Request): Promise<Response> => {
  const limit = await checkRateLimit({
    name: "oauth-register-ip",
    key: clientIpFrom(req.headers),
    limit: REGISTRATIONS_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!limit.success) {
    const init = tooManyRequestsInit(limit);
    return oauthError(init.status, "too_many_requests", "Too many registrations from this address.", init.headers);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return oauthError(400, "invalid_client_metadata", "The registration request is too large.");
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return oauthError(400, "invalid_client_metadata", "The registration request is too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return oauthError(400, "invalid_client_metadata", "The request body must be JSON.");
  }

  const parsed = parseRegistration(body);
  if (!parsed.ok) return oauthError(400, parsed.error.error, parsed.error.error_description);

  const client = await db.oAuthClient.create({
    data: { kind: "registered", name: parsed.value.name, redirectUris: parsed.value.redirectUris },
    select: { id: true, name: true, redirectUris: true, createdAt: true },
  });
  return publicJson(registrationResponse(client), { status: 201 });
});

export const OPTIONS = whenOAuthEnabled(() => publicPreflight("POST"));
