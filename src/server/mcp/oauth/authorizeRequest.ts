/**
 * Validating an authorization request (hosted MCP Agent PRD, D11). The consent
 * page runs this before it renders anything, and `oauthConnection.approve`
 * runs it again server-side, so neither trusts the other.
 *
 * Two kinds of failure, as RFC 6749 §4.1.2.1 requires:
 *
 * - an unknown client or a redirect URI the client did not register: the
 *   person sees an error page and is never redirected, because the redirect
 *   target itself is untrusted;
 * - anything else (no `code` response type, no S256 PKCE challenge, a
 *   `resource` other than the MCP endpoint): the client is sent the OAuth
 *   error, with its `state`, at its own redirect URI.
 */

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { redirectUriMatches } from "./clients";
import { mcpResource, oauthIssuer } from "./metadata";
import { isMetadataDocumentClientId, type MetadataFetchDeps, resolveMetadataClient } from "./metadataClient";

const param = z.string().max(4096).optional();

/** The query parameters of `/oauth/authorize`, all optional until validated. */
export const authorizeParamsSchema = z.object({
  response_type: param,
  client_id: param,
  redirect_uri: param,
  state: param,
  code_challenge: param,
  code_challenge_method: param,
  scope: param,
  resource: param,
});

export type AuthorizeParams = z.infer<typeof authorizeParamsSchema>;

export interface ValidAuthorizeRequest {
  client: { id: string; kind: string; name: string; redirectUris: string[]; metadataUrl: string | null };
  /** Exactly the URI the code will be delivered to, and checked against at the token endpoint. */
  redirectUri: string;
  state: string | undefined;
  codeChallenge: string;
  resource: string;
}

export type AuthorizeValidation =
  | { kind: "invalid-client"; message: string }
  | { kind: "redirect-error"; redirectTo: string }
  | { kind: "valid"; request: ValidAuthorizeRequest };

/** RFC 7636 §4.2: a challenge is 43 to 128 unreserved characters. */
const CODE_CHALLENGE = /^[A-Za-z0-9\-._~]{43,128}$/;

/** `redirectUri` with the given parameters added, plus `iss` (RFC 9207). */
function withParams(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  url.searchParams.set("iss", oauthIssuer());
  return url.toString();
}

/** The client's redirect URI carrying an OAuth error. */
export function authorizeErrorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state: string | undefined,
): string {
  return withParams(redirectUri, { error, error_description: description, state });
}

/** The client's redirect URI carrying the authorization code. */
export function authorizeSuccessRedirect(redirectUri: string, code: string, state: string | undefined): string {
  return withParams(redirectUri, { code, state });
}

/** Whether `resource` names the MCP endpoint; a missing one is taken to. */
function isCanonicalResource(resource: string | undefined): boolean {
  if (resource === undefined || resource === "") return true;
  const canonical = mcpResource();
  return resource === canonical || resource === `${canonical}/`;
}

export async function validateAuthorizeRequest(
  db: Pick<PrismaClient, "oAuthClient">,
  params: AuthorizeParams,
  deps: MetadataFetchDeps = {},
): Promise<AuthorizeValidation> {
  const clientId = params.client_id;
  let client: ValidAuthorizeRequest["client"] | null = null;
  if (clientId && isMetadataDocumentClientId(clientId)) {
    // A client ID metadata document (D10): fetched, or reused for 24 hours.
    const resolved = await resolveMetadataClient(db, clientId, deps);
    if (!resolved.ok) {
      return {
        kind: "invalid-client",
        message: `This app can't be connected: ${resolved.message}. Start again from the app.`,
      };
    }
    client = resolved.client;
  } else if (clientId) {
    client = await db.oAuthClient.findUnique({
      where: { id: clientId },
      select: { id: true, kind: true, name: true, redirectUris: true, metadataUrl: true },
    });
  }
  if (!client) {
    return {
      kind: "invalid-client",
      message: "This app isn't registered with this install, so it can't be connected. Start again from the app.",
    };
  }

  // With exactly one registered redirect URI it may be omitted (RFC 6749 §3.1.2.3).
  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !redirectUriMatches(client.redirectUris, redirectUri)) {
    return {
      kind: "invalid-client",
      message: `${client.name} asked to send you somewhere it didn't register, so this request was stopped. Start again from the app.`,
    };
  }

  const state = params.state;
  const refuse = (error: string, description: string): AuthorizeValidation => ({
    kind: "redirect-error",
    redirectTo: authorizeErrorRedirect(redirectUri, error, description, state),
  });

  if (params.response_type !== "code") {
    return refuse("unsupported_response_type", "Only the authorization code flow (response_type=code) is supported.");
  }
  if (params.code_challenge_method !== "S256" || !params.code_challenge || !CODE_CHALLENGE.test(params.code_challenge)) {
    return refuse("invalid_request", "PKCE is required: send a code_challenge with code_challenge_method=S256.");
  }
  if (!isCanonicalResource(params.resource)) {
    return refuse("invalid_target", `This server issues tokens only for ${mcpResource()}.`);
  }

  return {
    kind: "valid",
    request: { client, redirectUri, state, codeChallenge: params.code_challenge, resource: mcpResource() },
  };
}
