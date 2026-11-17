/**
 * Clients identified by a client ID metadata document (hosted MCP Agent PRD,
 * D10). Instead of registering, such a client uses the URL of a JSON document
 * it publishes as its `client_id`; the document lists its name and redirect
 * URIs. Claude offers this as "Use Claude's published identity".
 *
 * Fetching a URL a stranger chose is an SSRF primitive, and anyone can
 * trigger it by opening `/oauth/authorize`. So the URL first passes
 * `assertSafeOutboundUrl` (https only, no private or loopback address), and
 * the request itself checks again where it matters: the socket's own DNS
 * lookup refuses a private answer, so the address that was checked is the
 * address connected to and a rebinding DNS server can't swap in an internal
 * one between the two. It follows no redirects, gives up after 5 seconds and
 * reads at most 64 KB. The document is cached as an `OAuthClient` of kind
 * `metadata` and reused for 24 hours before it is fetched again.
 */

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import type { PrismaClient } from "@prisma/client";

import {
  assertSafeOutboundUrl,
  defaultResolveHost,
  isPrivateAddress,
  type ResolveHost,
} from "~/server/utils/privateAddress";
import { parseRegistration, UNNAMED_CLIENT } from "./registration";

/** A cached document is reused this long before it is fetched again. */
export const METADATA_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_DOCUMENT_BYTES = 64 * 1024;

export interface MetadataClient {
  id: string;
  kind: string;
  name: string;
  redirectUris: string[];
  metadataUrl: string | null;
}

export type MetadataClientResult = { ok: true; client: MetadataClient } | { ok: false; message: string };

/** A fetched document: the HTTP status and, for a 200, the body. */
export interface FetchedDocument {
  status: number;
  body: string;
}

/** What the fetch depends on; tests replace both, so no test touches the network. */
export interface MetadataFetchDeps {
  getDocument?: (url: string) => Promise<FetchedDocument>;
  resolveHost?: ResolveHost;
}

class MetadataDocumentError extends Error {}

type LookupAll = (
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void;

/**
 * A socket lookup that refuses any private or loopback answer (the DNS
 * rebinding defence). Node calls it to resolve the host it is about to
 * connect to, so what it lets through is what the request reaches.
 * `allowLoopback` is the local-development escape hatch for `localhost`.
 */
export function publicOnlyLookup(allowLoopback: boolean, lookupAll: LookupAll = dns.lookup): LookupFunction {
  return (hostname, options, callback) => {
    lookupAll(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, "");
        return;
      }
      const first = addresses[0];
      if (!first || (!allowLoopback && addresses.some((entry) => isPrivateAddress(entry.address)))) {
        const refused: NodeJS.ErrnoException = new Error(`${hostname} resolves to a private or loopback address`);
        refused.code = "EPRIVATEADDRESS";
        callback(refused, "");
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, first.address, first.family);
    });
  };
}

/** GET `url` once: no redirects, a 5 second budget, at most 64 KB, through the public-only lookup. */
function getPinnedDocument(url: string): Promise<FetchedDocument> {
  const target = new URL(url);
  const allowLoopback = process.env.NODE_ENV !== "production" && target.hostname === "localhost";
  const client = target.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const request = client.get(
      target,
      { headers: { accept: "application/json" }, lookup: publicOnlyLookup(allowLoopback) },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status !== 200) {
          response.resume();
          resolve({ status, body: "" });
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_DOCUMENT_BYTES) {
            response.destroy();
            reject(new MetadataDocumentError("its client document is larger than 64 KB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
        response.on("error", reject);
      },
    );
    const timer = setTimeout(() => request.destroy(new Error("timed out")), FETCH_TIMEOUT_MS);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
}

/**
 * Whether `clientId` names a metadata document rather than a registered
 * client: an https URL with a path, no fragment, no credentials and no dot
 * segments. Outside production a localhost URL over http counts too, as the
 * outbound guard allows, so the flow can be exercised locally.
 */
export function isMetadataDocumentClientId(clientId: string): boolean {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  const localDev =
    process.env.NODE_ENV !== "production" && url.protocol === "http:" && url.hostname === "localhost";
  if (url.protocol !== "https:" && !localDev) return false;
  if (url.pathname === "/" || url.hash !== "" || clientId.includes("#")) return false;
  if (url.username !== "" || url.password !== "") return false;
  // `new URL` resolves dot segments away, so look at the path as it was sent.
  const afterScheme = clientId.slice(clientId.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  const rawPath = slash === -1 ? "" : (afterScheme.slice(slash).split(/[?#]/)[0] ?? "");
  return !rawPath.split("/").some((segment) => segment === "." || segment === "..");
}

/** Fetch and check the document at `url`; throws `MetadataDocumentError` with a reason. */
async function fetchDocument(url: string, deps: MetadataFetchDeps): Promise<{ name: string; redirectUris: string[] }> {
  await assertSafeOutboundUrl(
    url,
    {
      invalidUrl: "its client ID is not a valid URL",
      insecureProtocol: "its client document must be served over https",
      privateAddress: "its client document is on a private or loopback network",
      unresolvable: (hostname) => `${hostname} could not be resolved`,
      resolvesPrivate: (hostname) => `${hostname} resolves to a private or loopback address`,
    },
    (message) => new MetadataDocumentError(message),
    deps.resolveHost ?? defaultResolveHost,
  );

  let fetched: FetchedDocument;
  try {
    fetched = await (deps.getDocument ?? getPinnedDocument)(url);
  } catch (error) {
    if (error instanceof MetadataDocumentError) throw error;
    const refusedAddress = (error as NodeJS.ErrnoException).code === "EPRIVATEADDRESS";
    throw new MetadataDocumentError(
      refusedAddress ? `${new URL(url).hostname} resolves to a private or loopback address` : "its client document could not be fetched",
    );
  }
  if (fetched.status !== 200) {
    throw new MetadataDocumentError(`its client document answered HTTP ${fetched.status}`);
  }
  if (Buffer.byteLength(fetched.body, "utf8") > MAX_DOCUMENT_BYTES) {
    throw new MetadataDocumentError("its client document is larger than 64 KB");
  }

  let document: unknown;
  try {
    document = JSON.parse(fetched.body);
  } catch {
    throw new MetadataDocumentError("its client document is not JSON");
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new MetadataDocumentError("its client document is not a JSON object");
  }
  const fields = document as Record<string, unknown>;
  if (fields.client_id !== url) {
    throw new MetadataDocumentError("its client document names a different client_id");
  }
  // Every client here is public: one that expects to authenticate can't use this server.
  const authMethod = fields.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== "none") {
    const asked = typeof authMethod === "string" ? authMethod.slice(0, 50) : "client authentication";
    throw new MetadataDocumentError(`its client document asks for ${asked}, and only public clients are supported`);
  }

  const parsed = parseRegistration(fields);
  if (!parsed.ok) throw new MetadataDocumentError(`its client document is not usable: ${parsed.error.error_description}`);
  const name = parsed.value.name === UNNAMED_CLIENT ? new URL(url).hostname : parsed.value.name;
  return { name, redirectUris: parsed.value.redirectUris };
}

/**
 * The `OAuthClient` for a metadata-document `client_id`: the cached row when
 * it was fetched in the last 24 hours, otherwise the document fetched afresh
 * and the row upserted. A document that can't be fetched or fails a check is
 * refused, even when an older copy is cached: its redirect URIs may have changed.
 */
export async function resolveMetadataClient(
  db: Pick<PrismaClient, "oAuthClient">,
  clientId: string,
  deps: MetadataFetchDeps = {},
): Promise<MetadataClientResult> {
  const select = { id: true, kind: true, name: true, redirectUris: true, metadataUrl: true } as const;
  const cached = await db.oAuthClient.findUnique({
    where: { metadataUrl: clientId },
    select: { ...select, fetchedAt: true },
  });
  const now = new Date();
  if (cached?.fetchedAt && now.getTime() - cached.fetchedAt.getTime() < METADATA_DOCUMENT_TTL_MS) {
    const { id, kind, name, redirectUris, metadataUrl } = cached;
    return { ok: true, client: { id, kind, name, redirectUris, metadataUrl } };
  }

  let document: { name: string; redirectUris: string[] };
  try {
    document = await fetchDocument(clientId, deps);
  } catch (error) {
    if (error instanceof MetadataDocumentError) return { ok: false, message: error.message };
    throw error;
  }

  const client = await db.oAuthClient.upsert({
    where: { metadataUrl: clientId },
    create: { kind: "metadata", metadataUrl: clientId, ...document, fetchedAt: now },
    update: { ...document, fetchedAt: now },
    select,
  });
  return { ok: true, client };
}
