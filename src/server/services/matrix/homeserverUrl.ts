/**
 * Guarding the one place Exponential fetches a URL the user chose.
 *
 * Registering a homeserver hands the server an arbitrary URL and asks it to make a
 * request — an SSRF primitive. Workspace owner/admin is a real gate, but not enough on
 * its own: the registered URL is persisted and re-fetched by every later room listing,
 * so a single bad registration is a durable probe of whatever the app server can reach
 * (cloud metadata endpoints, internal admin APIs, databases on the private network).
 *
 * Three checks, because each catches something the others miss:
 *
 *  1. Scheme — https only, so credentials are not sent in the clear.
 *  2. Literal address — an IP written directly into the URL.
 *  3. Resolved address — the hostname's actual A/AAAA records, which is the only way to
 *     catch a public name that deliberately points at a private address.
 *
 * This does not defeat DNS rebinding: the name is resolved here and again by `fetch`,
 * and a hostile resolver can answer differently each time. Closing that needs pinning
 * the connection to the checked IP, which is out of scope for V1 — it raises the cost
 * substantially without being the attack anyone reaches for first.
 */

import { isIP } from "node:net";

import {
  defaultResolveHost,
  isPrivateAddress,
  type ResolveHost,
} from "~/server/utils/privateAddress";

export type { ResolveHost };

export class UnsafeHomeserverUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeHomeserverUrlError";
  }
}

/**
 * Localhost is allowed outside production so the feature stays testable against a local
 * homeserver. It is refused in production, where a loopback address can only mean the
 * app server itself.
 */
function localhostAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

function isLocalhostName(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Throw unless `rawUrl` is a homeserver this server may safely call.
 *
 * Resolves DNS, so callers should treat it as a network operation.
 */
export async function assertSafeHomeserverUrl(
  rawUrl: string,
  resolveHost: ResolveHost = defaultResolveHost,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeHomeserverUrlError("That is not a valid URL.");
  }

  const allowLocal = localhostAllowed() && isLocalhostName(url.hostname);

  if (url.protocol !== "https:" && !allowLocal) {
    throw new UnsafeHomeserverUrlError(
      "The homeserver URL must use https, so the bot's access token is never sent in the clear.",
    );
  }

  if (allowLocal) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeHomeserverUrlError(
        "That address is on a private or loopback network, which Exponential will not call.",
      );
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new UnsafeHomeserverUrlError(
      `Could not resolve ${url.hostname}. Check the homeserver URL is correct and publicly resolvable.`,
    );
  }

  // Every answer must be public: one private record is enough to make the name unsafe.
  if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
    throw new UnsafeHomeserverUrlError(
      `${url.hostname} resolves to a private or loopback address, which Exponential will not call.`,
    );
  }
}
