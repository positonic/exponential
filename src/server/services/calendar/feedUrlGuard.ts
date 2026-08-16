/**
 * SSRF guard for ICS calendar feed URLs.
 *
 * Adding a feed hands the server an arbitrary URL that is persisted and then
 * re-fetched by every cron sweep — the same durable-probe primitive as Matrix
 * homeserver registration (see src/server/services/matrix/homeserverUrl.ts
 * for the full rationale). The checks live in the shared
 * `assertSafeOutboundUrl` skeleton; this wrapper supplies the feed-specific
 * error type and wording. Redirect hops are re-validated by the fetcher in
 * CalendarSyncService, which also enforces the size cap and timeout.
 */

import {
  assertSafeOutboundUrl,
  defaultResolveHost,
  type ResolveHost,
} from "~/server/utils/privateAddress";

export class UnsafeFeedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeFeedUrlError";
  }
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
  await assertSafeOutboundUrl(
    rawUrl,
    {
      invalidUrl: "That is not a valid URL.",
      insecureProtocol:
        "Calendar feed URLs must use https — an ICS subscription URL is a secret and must never travel in the clear.",
      privateAddress:
        "That address is on a private or loopback network, which Exponential will not fetch.",
      unresolvable: (hostname) =>
        `Could not resolve ${hostname}. Check the feed URL is correct and publicly resolvable.`,
      resolvesPrivate: (hostname) =>
        `${hostname} resolves to a private or loopback address, which Exponential will not fetch.`,
    },
    (message) => new UnsafeFeedUrlError(message),
    resolveHost,
  );
}
