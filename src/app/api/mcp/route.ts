/**
 * The hosted MCP endpoint (hosted MCP Agent PRD, D4): Streamable HTTP,
 * stateless, served by the app itself so a self-hosted install serves it at
 * its own address. A client authenticates with `Authorization: Bearer` (an
 * External agent key or a personal API token); tool calls run in-process
 * through tRPC as that principal, through the same procedures and access
 * checks as every other caller.
 *
 * Per request, in order: the Origin check, the credential, the rate limit,
 * then serving.
 */

import { after } from "next/server";

import { flushAnalytics } from "~/server/analytics/posthog";
import { db } from "~/server/db";
import { bearerTokenFrom, resolveBearerToken } from "~/server/services/access/bearer";
import { createInProcessClient } from "~/server/mcp/inProcessClient";
import { checkOrigin, corsHeaders, PREFLIGHT_HEADERS, withHeaders } from "~/server/mcp/origin";
import { forbiddenOrigin, methodNotAllowed, tooManyRequests, unauthorized } from "~/server/mcp/responses";
import { serveMcpRequest } from "~/server/mcp/serve";
import { checkRateLimit } from "~/server/utils/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The credentials this endpoint accepts (Agent PRD D5): an External agent key,
 * or a person's own API token, which acts as that person. Every other JWT type
 * (chat gateways, agent-context, device, extension, voice) is refused, and a
 * session cookie never authenticates: `auth()` is never called here.
 */
const ACCEPTED_TOKEN_TYPES: ReadonlySet<string> = new Set(["agent-key", "api-token"]);

/**
 * Requests a principal may make per minute (Agent PRD D6, open question 4).
 * A guess until there is traffic. Keyed by the session user, so each agent
 * and each person has its own budget, shared across its keys and tokens.
 */
const MCP_REQUESTS_PER_MINUTE = 120;

export async function POST(req: Request): Promise<Response> {
  const origin = checkOrigin(req.headers);
  if (!origin.allowed) return forbiddenOrigin();
  const cors = corsHeaders(origin.corsOrigin);

  const token = bearerTokenFrom(req.headers);
  const resolved = token ? await resolveBearerToken(token) : null;
  if (!resolved?.tokenType || !ACCEPTED_TOKEN_TYPES.has(resolved.tokenType)) {
    return withHeaders(unauthorized(token !== null), cors);
  }

  const limit = await checkRateLimit({
    name: "mcp-principal",
    key: resolved.session.user.id,
    limit: MCP_REQUESTS_PER_MINUTE,
    windowSeconds: 60,
  });
  if (!limit.success) return withHeaders(tooManyRequests(limit), cors);

  // Tool calls capture analytics through the tRPC middleware; send them once
  // the response is out, as the tRPC route does.
  after(flushAnalytics);

  const client = createInProcessClient({ db, ...resolved, headers: req.headers });
  return withHeaders(await serveMcpRequest(req, client), cors);
}

/** CORS preflight: answered only for an allowed origin. */
export function OPTIONS(req: Request): Response {
  const origin = checkOrigin(req.headers);
  if (!origin.allowed) return forbiddenOrigin();
  return new Response(null, {
    status: 204,
    headers: { Allow: "POST", ...corsHeaders(origin.corsOrigin), ...(origin.corsOrigin ? PREFLIGHT_HEADERS : {}) },
  });
}

// Stateless: no SSE stream to open with GET and no session to end with DELETE.
export function GET(): Response {
  return methodNotAllowed();
}

export function DELETE(): Response {
  return methodNotAllowed();
}
