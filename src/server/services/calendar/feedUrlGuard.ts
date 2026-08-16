/**
 * SSRF guard for ICS calendar feed URLs.
 *
 * Adding a feed hands the server an arbitrary URL that is persisted and then
 * re-fetched by every cron sweep — the same durable-probe primitive as Matrix
 * homeserver registration (see src/server/services/matrix/homeserverUrl.ts
 * for the full rationale). Checks: https only, no literal private address, no
 * hostname resolving to a private address. Redirect hops are re-validated by
 * the fetcher in CalendarSyncService, which also enforces the size cap and
 * timeout.
 */

import { isIP } from "node:net";

import {
  defaultResolveHost,
  isPrivateAddress,
  type ResolveHost,
} from "~/server/utils/privateAddress";

export class UnsafeFeedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeFeedUrlError";
  }
}

/**
 * Localhost is allowed outside production so the feature stays testable
 * against a locally served .ics file. Refused in production, where a loopback
 * address can only mean the app server itself.
 */
function localhostAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

function isLocalhostName(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Throw unless `rawUrl` is a calendar feed URL this server may safely fetch.
 *
 * Resolves DNS, so callers should treat it as a network operation. Called on
 * `addFeed` and again on every sync fetch (the URL is a stored input, and
 * DNS answers change).
 */
export async function assertSafeFeedUrl(
  rawUrl: string,
  resolveHost: ResolveHost = defaultResolveHost,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeFeedUrlError("That is not a valid URL.");
  }

  const allowLocal = localhostAllowed() && isLocalhostName(url.hostname);

  if (url.protocol !== "https:" && !allowLocal) {
    throw new UnsafeFeedUrlError(
      "Calendar feed URLs must use https — an ICS subscription URL is a secret and must never travel in the clear.",
    );
  }

  if (allowLocal) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeFeedUrlError(
        "That address is on a private or loopback network, which Exponential will not fetch.",
      );
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new UnsafeFeedUrlError(
      `Could not resolve ${url.hostname}. Check the feed URL is correct and publicly resolvable.`,
    );
  }

  // Every answer must be public: one private record is enough to make the name unsafe.
  if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
    throw new UnsafeFeedUrlError(
      `${url.hostname} resolves to a private or loopback address, which Exponential will not fetch.`,
    );
  }
}
