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

/** Resolve a hostname to its addresses. Injectable so the guard is testable without DNS. */
export type ResolveHost = (hostname: string) => Promise<string[]>;

/**
 * Imported lazily rather than at module load: this module is pulled into the client
 * type graph through the router, and `node:dns` is not resolvable in every environment
 * the test runner uses.
 */
const defaultResolveHost: ResolveHost = async (hostname) => {
  const { lookup } = await import("node:dns/promises");
  const entries = await lookup(hostname, { all: true });
  return entries.map((entry) => entry.address);
};

/** Loopback, link-local, and the RFC 1918 / RFC 4193 private ranges. */
function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts as [number, number, number, number];

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this host"
  if (a === 169 && b === 254) return true; // link-local — includes 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(normalized)) return true; // unique local
  // IPv4-mapped (::ffff:169.254.169.254) — judge the embedded address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  return false;
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return true; // unparseable — refuse rather than guess
}

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
