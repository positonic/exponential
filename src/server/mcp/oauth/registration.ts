/**
 * Dynamic client registration (RFC 7591) for MCP clients (hosted MCP Agent
 * PRD, D9 and D10). Every client is public: it gets a `client_id`, never a
 * secret, and authenticates at the token endpoint with PKCE alone. Only the
 * name and redirect URIs are kept; other metadata is ignored.
 */

import { isAllowedRedirectUri, MAX_REDIRECT_URI_LENGTH } from "./redirectUris";

/** Longest client name kept; longer names are cut, as the agent name will be (D11). */
export const MAX_CLIENT_NAME_LENGTH = 100;
/** Most redirect URIs one client may register. */
export const MAX_REDIRECT_URIS = 10;
/** The name shown for a client that sends none. */
export const UNNAMED_CLIENT = "MCP client";

export interface ClientRegistration {
  name: string;
  redirectUris: string[];
}

/** An RFC 7591 §3.2.2 error. */
export interface RegistrationError {
  error: "invalid_redirect_uri" | "invalid_client_metadata";
  error_description: string;
}

export type RegistrationResult = { ok: true; value: ClientRegistration } | { ok: false; error: RegistrationError };

function refuse(error: RegistrationError["error"], description: string): RegistrationResult {
  return { ok: false, error: { error, error_description: description } };
}

/** Validate a registration request body. */
export function parseRegistration(body: unknown): RegistrationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return refuse("invalid_client_metadata", "The request body must be a JSON object.");
  }
  const metadata = body as Record<string, unknown>;

  const rawUris = metadata.redirect_uris;
  if (!Array.isArray(rawUris) || rawUris.length === 0) {
    return refuse("invalid_redirect_uri", "redirect_uris must be a non-empty array.");
  }
  if (rawUris.length > MAX_REDIRECT_URIS) {
    return refuse("invalid_redirect_uri", `At most ${MAX_REDIRECT_URIS} redirect URIs may be registered.`);
  }
  const redirectUris: string[] = [];
  for (const uri of rawUris) {
    if (typeof uri !== "string" || !isAllowedRedirectUri(uri)) {
      const shown = typeof uri === "string" ? uri.slice(0, MAX_REDIRECT_URI_LENGTH) : String(uri);
      return refuse(
        "invalid_redirect_uri",
        `Redirect URI not allowed: ${shown}. Use https, loopback http (127.0.0.1, [::1] or localhost) or a private-use scheme, with no fragment.`,
      );
    }
    if (!redirectUris.includes(uri)) redirectUris.push(uri);
  }

  const rawName = metadata.client_name;
  if (rawName !== undefined && typeof rawName !== "string") {
    return refuse("invalid_client_metadata", "client_name must be a string.");
  }
  const name = (rawName ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CLIENT_NAME_LENGTH).trim();

  return { ok: true, value: { name: name.length > 0 ? name : UNNAMED_CLIENT, redirectUris } };
}

/** The RFC 7591 §3.2.1 response for a stored client. */
export function registrationResponse(client: { id: string; name: string; redirectUris: string[]; createdAt: Date }) {
  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  };
}
