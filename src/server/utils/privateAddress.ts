/**
 * Private/loopback address detection shared by every guard that fetches a
 * user-chosen URL (Matrix homeserver registration, ICS calendar feeds).
 *
 * Extracted from the Matrix homeserver guard so the "is this address one the
 * app server may call?" judgement exists exactly once. See
 * src/server/services/matrix/homeserverUrl.ts for the full threat rationale.
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

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return true; // unparseable — refuse rather than guess
}
