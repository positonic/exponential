/**
 * Private/loopback address detection and the shared outbound-URL guard
 * skeleton used by every place Exponential fetches a user-chosen URL
 * (Matrix homeserver registration, ICS calendar feeds).
 *
 * Extracted from the Matrix homeserver guard so the "is this address one the
 * app server may call?" judgement — and the orchestration around it — exists
 * exactly once. See src/server/services/matrix/homeserverUrl.ts for the full
 * threat rationale.
 */

import { isIP } from "node:net";

/** Resolve a hostname to its addresses. Injectable so guards are testable without DNS. */
export type ResolveHost = (hostname: string) => Promise<string[]>;

/**
 * Imported lazily rather than at module load: this module is pulled into the client
 * type graph through the router, and `node:dns` is not resolvable in every environment
 * the test runner uses.
 */
export const defaultResolveHost: ResolveHost = async (hostname) => {
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

/**
 * Normalize an IPv6 address to its 8 hextets (numbers). Handles `::`
 * compression and a trailing embedded dotted quad (`::ffff:127.0.0.1`).
 * Returns null when the address doesn't parse — callers refuse those.
 */
function ipv6Hextets(address: string): number[] | null {
  let addr = address.toLowerCase().replace(/^\[|\]$/g, "");
  // Strip a zone index (fe80::1%en0) — the address part is what we judge.
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);

  // Convert a trailing dotted quad into two hextets so every form is uniform.
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (dotted) {
    const quad = dotted[2]!.split(".").map(Number);
    if (quad.length !== 4 || quad.some((n) => Number.isNaN(n) || n > 255)) return null;
    addr =
      dotted[1]! +
      ((quad[0]! << 8) | quad[1]!).toString(16) +
      ":" +
      ((quad[2]! << 8) | quad[3]!).toString(16);
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 && missing < 0) return null;
  if (halves.length === 1 && head.length !== 8) return null;

  const groups = halves.length === 2 ? [...head, ...Array<string>(missing).fill("0"), ...tail] : head;
  const hextets = groups.map((g) => parseInt(g === "" ? "0" : g, 16));
  if (hextets.length !== 8 || hextets.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) {
    return null;
  }
  return hextets;
}

/** The IPv4 address embedded in the last two hextets, as dotted quad. */
function embeddedIPv4(hextets: number[]): string {
  const a = hextets[6]!;
  const b = hextets[7]!;
  return `${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`;
}

/**
 * Judged on the NORMALIZED form, so hex-form mapped addresses
 * (`::ffff:7f00:1`), uncompressed forms (`0:0:0:0:0:ffff:127.0.0.1`) and
 * NAT64 (`64:ff9b::7f00:1`) can't smuggle a private IPv4 past the guard.
 */
function isPrivateIPv6(address: string): boolean {
  const h = ipv6Hextets(address);
  if (!h) return true; // unparseable — refuse rather than guess

  const allZero = h.every((n) => n === 0);
  if (allZero) return true; // ::
  if (h.slice(0, 7).every((n) => n === 0) && h[7] === 1) return true; // ::1
  if ((h[0]! & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h[0]! & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h[0]! & 0xff00) === 0xff00) return true; // multicast ff00::/8

  // IPv4-mapped ::ffff:0:0/96 — judge the embedded address.
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) {
    return isPrivateIPv4(embeddedIPv4(h));
  }
  // NAT64 64:ff9b::/96 — a private embedded address reaches private space
  // through the translator.
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return isPrivateIPv4(embeddedIPv4(h));
  }

  return false;
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address.replace(/^\[|\]$/g, ""));
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return true; // unparseable — refuse rather than guess
}

/** Per-guard wording; the checks themselves are shared. */
export interface OutboundUrlGuardMessages {
  invalidUrl: string;
  insecureProtocol: string;
  privateAddress: string;
  unresolvable: (hostname: string) => string;
  resolvesPrivate: (hostname: string) => string;
}

/**
 * Localhost is allowed outside production so features stay testable against
 * local servers. Refused in production, where a loopback address can only
 * mean the app server itself.
 */
function localhostAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

function isLocalhostName(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Shared skeleton for "may this server safely call this user-chosen URL?":
 * https-only, no literal private address, no hostname resolving to a private
 * address. Guards wrap this with their own error type and wording.
 *
 * Resolves DNS, so callers should treat it as a network operation. This does
 * not defeat DNS rebinding (the name is resolved here and again by fetch) —
 * accepted, documented in the Matrix guard.
 */
export async function assertSafeOutboundUrl(
  rawUrl: string,
  messages: OutboundUrlGuardMessages,
  makeError: (message: string) => Error,
  resolveHost: ResolveHost = defaultResolveHost,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw makeError(messages.invalidUrl);
  }

  const allowLocal = localhostAllowed() && isLocalhostName(url.hostname);

  if (url.protocol !== "https:" && !allowLocal) {
    throw makeError(messages.insecureProtocol);
  }

  if (allowLocal) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw makeError(messages.privateAddress);
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw makeError(messages.unresolvable(url.hostname));
  }

  // Every answer must be public: one private record is enough to make the name unsafe.
  if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
    throw makeError(messages.resolvesPrivate(url.hostname));
  }
}
