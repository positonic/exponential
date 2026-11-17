/**
 * Identifying an MCP client (hosted MCP Agent PRD, D10): matching a presented
 * redirect URI against the registered ones, a client's stable identity for
 * reconnects, and how its redirect target is shown on the consent page.
 */

import { classifyRedirectUri } from "./redirectUris";

export interface OAuthClientIdentity {
  kind: string;
  name: string;
  redirectUris: string[];
  metadataUrl?: string | null;
}

/**
 * Whether `presented` is one of the client's redirect URIs. Exact string
 * equality, except that a loopback URI matches on any port (RFC 8252 §7.3):
 * desktop and CLI clients pick a free port each time.
 */
export function redirectUriMatches(registered: readonly string[], presented: string): boolean {
  if (registered.includes(presented)) return true;
  if (classifyRedirectUri(presented) !== "loopback") return false;
  const want = new URL(presented);
  return registered.some((uri) => {
    if (classifyRedirectUri(uri) !== "loopback") return false;
    const have = new URL(uri);
    return (
      have.protocol === want.protocol &&
      have.hostname === want.hostname &&
      have.pathname === want.pathname &&
      have.search === want.search
    );
  });
}

/** One redirect URI reduced to the part that identifies its client. */
function redirectHostKey(uri: string): string {
  const kind = classifyRedirectUri(uri);
  if (kind === "loopback") return "loopback";
  const url = new URL(uri);
  return kind === "private-use" ? url.protocol : url.hostname.toLowerCase();
}

/**
 * The client's stable identity for one owner (D10), which reconnects match on.
 * For a registered client: its lower-cased name plus its sorted, de-duplicated
 * redirect hosts, loopback written as `loopback` and a private-use URI reduced
 * to its scheme. A code is only ever delivered to a redirect URI the client
 * declared, so a client that copies another's name cannot receive that
 * client's tokens.
 */
export function clientKeyFor(client: OAuthClientIdentity): string {
  if (client.kind === "metadata" && client.metadataUrl) return client.metadataUrl;
  const hosts = [...new Set(client.redirectUris.map(redirectHostKey))].sort();
  return `${client.name.toLowerCase()}|${hosts.join(" ")}`;
}

/**
 * Whether the `client_id` a client presents at the token endpoint is the
 * client a grant was issued to: its registration id, or for a metadata client
 * the document URL it uses as its `client_id`.
 */
export function isClientId(client: { id: string; metadataUrl: string | null }, presented: string): boolean {
  return presented === client.id || (client.metadataUrl !== null && presented === client.metadataUrl);
}

/** Where a redirect URI sends the person, in words for the consent page. */
export function describeRedirectTarget(uri: string): string {
  const kind = classifyRedirectUri(uri);
  const url = new URL(uri);
  if (kind === "loopback") return `an app on this computer (${url.hostname})`;
  if (kind === "private-use") return `the ${url.protocol}// app on this device`;
  return url.hostname;
}
