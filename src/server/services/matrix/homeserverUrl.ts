/**
 * Guarding one of the places Exponential fetches a URL the user chose.
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
 * The checks live in the shared `assertSafeOutboundUrl` skeleton (also used by the
 * ICS calendar feed guard); this wrapper supplies the homeserver-specific error type
 * and wording.
 *
 * This does not defeat DNS rebinding: the name is resolved here and again by `fetch`,
 * and a hostile resolver can answer differently each time. Closing that needs pinning
 * the connection to the checked IP, which is out of scope for V1 — it raises the cost
 * substantially without being the attack anyone reaches for first.
 */

import {
  assertSafeOutboundUrl,
  defaultResolveHost,
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
 * Throw unless `rawUrl` is a homeserver this server may safely call.
 *
 * Resolves DNS, so callers should treat it as a network operation.
 */
export async function assertSafeHomeserverUrl(
  rawUrl: string,
  resolveHost: ResolveHost = defaultResolveHost,
): Promise<void> {
  await assertSafeOutboundUrl(
    rawUrl,
    {
      invalidUrl: "That is not a valid URL.",
      insecureProtocol:
        "The homeserver URL must use https, so the bot's access token is never sent in the clear.",
      privateAddress:
        "That address is on a private or loopback network, which Exponential will not call.",
      unresolvable: (hostname) =>
        `Could not resolve ${hostname}. Check the homeserver URL is correct and publicly resolvable.`,
      resolvesPrivate: (hostname) =>
        `${hostname} resolves to a private or loopback address, which Exponential will not call.`,
    },
    (message) => new UnsafeHomeserverUrlError(message),
    resolveHost,
  );
}
