/**
 * OAuth for MCP clients: the mode switch, the canonical identifiers and the two
 * discovery documents (hosted MCP Agent PRD, D1 and D9).
 *
 * Every identifier comes from env through `getPublicBaseUrlFromEnv()`, never
 * from the request: a spoofed `Host` must not change the issuer a client trusts
 * or the audience a token is bound to. On Vercel previews that resolves to
 * production, so OAuth is exercised locally or on an install with
 * `NEXT_PUBLIC_APP_URL` set.
 */

import { env } from "~/env";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

export type McpOAuthMode = "off" | "admin" | "on";

/**
 * `MCP_OAUTH_MODE`; unset means `off`. `off`: the documents and OAuth routes
 * 404 and only keys authenticate `/api/mcp`. `admin`: published, but only app
 * admins can approve a connection. `on`: open to everyone.
 */
export function mcpOAuthMode(): McpOAuthMode {
  return env.MCP_OAUTH_MODE ?? "off";
}

export function isMcpOAuthEnabled(): boolean {
  return mcpOAuthMode() !== "off";
}

/** The one scope: access to the MCP endpoint as the connection's agent. */
export const MCP_SCOPE = "mcp";

/** The authorization server's issuer identifier: the app's own origin. */
export function oauthIssuer(): string {
  return getPublicBaseUrlFromEnv();
}

/** The protected resource, and the audience every access token is bound to. */
export function mcpResource(): string {
  return `${oauthIssuer()}/api/mcp`;
}

/** Where the protected-resource metadata for `/api/mcp` lives (RFC 9728 §3.1). */
export function protectedResourceMetadataUrl(): string {
  return `${oauthIssuer()}/.well-known/oauth-protected-resource/api/mcp`;
}

/** RFC 9728 protected-resource metadata for `/api/mcp`. */
export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [oauthIssuer()],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
  };
}

/**
 * RFC 8414 authorization-server metadata. It advertises only what this
 * install implements: public clients (no secret) registering themselves
 * or identified by a client ID metadata document, the authorization-code
 * grant with S256 PKCE, rotating refresh tokens, token revocation, and `iss`
 * on the redirect.
 */
export function authorizationServerMetadata() {
  const issuer = oauthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
  };
}
