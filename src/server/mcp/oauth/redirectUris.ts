/**
 * Which redirect URIs an MCP client may register (hosted MCP Agent PRD, D10).
 *
 * - `https`, to any host;
 * - loopback `http` (`127.0.0.1`, `[::1]`, `localhost`), for desktop and CLI
 *   clients that listen on a local port (RFC 8252 §7.3);
 * - a private-use scheme such as `cursor://…` (RFC 8252 §7.1), for native apps.
 *
 * Plain `http` to any other host is refused: the code would cross the network
 * in the clear. So are schemes that are not redirects at all (`javascript:`,
 * `data:`, `file:` and the like), fragments (RFC 6749 §3.1.2) and URIs that
 * carry credentials.
 */

export type RedirectUriKind = "https" | "loopback" | "private-use";

/** Longest redirect URI accepted, in characters. */
export const MAX_REDIRECT_URI_LENGTH = 2000;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "[::1]", "localhost"]);

/** Schemes that can run code or read local data, and are never redirect targets. */
const FORBIDDEN_SCHEMES: ReadonlySet<string> = new Set([
  "javascript:",
  "vbscript:",
  "data:",
  "file:",
  "blob:",
  "filesystem:",
  "about:",
]);

/** The kind of an acceptable redirect URI, or null when it must be refused. */
export function classifyRedirectUri(uri: string): RedirectUriKind | null {
  if (uri.length === 0 || uri.length > MAX_REDIRECT_URI_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.hash !== "" || uri.includes("#")) return null;
  if (url.username !== "" || url.password !== "") return null;

  if (url.protocol === "https:") return url.hostname === "" ? null : "https";
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname) ? "loopback" : null;
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return null;
  return "private-use";
}

export function isAllowedRedirectUri(uri: string): boolean {
  return classifyRedirectUri(uri) !== null;
}
