/**
 * Clients identified by a client ID metadata document (hosted MCP Agent PRD,
 * D10). DNS and fetch are injected, so no test touches the network; Prisma is
 * mocked. Modelled on the ICS feed guard's tests (feedUrlGuard.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { isMetadataDocumentClientId, METADATA_DOCUMENT_TTL_MS, publicOnlyLookup, resolveMetadataClient } from "../metadataClient";

const URL_ID = "https://claude.ai/oauth/claude-code-client-metadata";
const DOCUMENT = {
  client_id: URL_ID,
  client_name: "Claude Code",
  redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code", "refresh_token"],
};

const resolvePublic = async () => ["160.79.104.10"];
const resolvePrivate = async () => ["10.0.0.5"];

let db: DeepMockProxy<PrismaClient>;
let fetchMock: ReturnType<typeof vi.fn>;

const jsonResponse = (body: unknown) => ({ status: 200, body: typeof body === "string" ? body : JSON.stringify(body) });

const resolve = (deps: { resolveHost?: () => Promise<string[]> } = {}) =>
  resolveMetadataClient(db, URL_ID, { getDocument: fetchMock, resolveHost: resolvePublic, ...deps });

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  db.oAuthClient.findUnique.mockResolvedValue(null);
  db.oAuthClient.upsert.mockImplementation((args) =>
    Promise.resolve({ id: "cuid-1", kind: "metadata", metadataUrl: URL_ID, ...args.create }) as never,
  );
  fetchMock = vi.fn().mockResolvedValue(jsonResponse(DOCUMENT));
});

describe("isMetadataDocumentClientId", () => {
  it.each([
    [URL_ID, true],
    ["https://example.com/client.json?v=2", true],
    ["http://localhost:47124/client.json", true], // NODE_ENV is "test": the local escape hatch
    ["cmwke0ebw000006hn2bsly4m7", false], // a registered client's id
    ["https://example.com", false], // no path
    ["https://example.com/", false],
    ["http://example.com/client.json", false], // not https
    ["https://example.com/client.json#frag", false],
    ["https://user:pass@example.com/client.json", false],
    ["https://example.com/a/../client.json", false],
    ["https://example.com/./client.json", false],
  ])("%s → %s", (clientId, expected) => {
    expect(isMetadataDocumentClientId(clientId)).toBe(expected);
  });
});

describe("resolveMetadataClient", () => {
  it("fetches the document and upserts a metadata client with its name and redirect URIs", async () => {
    const result = await resolve();

    expect(result).toEqual({
      ok: true,
      client: expect.objectContaining({ kind: "metadata", name: "Claude Code", redirectUris: DOCUMENT.redirect_uris }) as unknown,
    });
    expect(fetchMock).toHaveBeenCalledWith(URL_ID);
    expect(db.oAuthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { metadataUrl: URL_ID },
        create: expect.objectContaining({ kind: "metadata", metadataUrl: URL_ID, fetchedAt: expect.any(Date) as unknown }) as unknown,
      }),
    );
  });

  it("does not refetch inside 24 hours: a second authorization reuses the cached client", async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      id: "cuid-1",
      kind: "metadata",
      name: "Claude Code",
      redirectUris: DOCUMENT.redirect_uris,
      metadataUrl: URL_ID,
      fetchedAt: new Date(Date.now() - 60 * 60 * 1000),
    } as never);

    const result = await resolve();

    expect(result).toMatchObject({ ok: true, client: { id: "cuid-1", name: "Claude Code" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it("refetches after 24 hours", async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      id: "cuid-1",
      kind: "metadata",
      name: "Old name",
      redirectUris: ["https://old.example/cb"],
      metadataUrl: URL_ID,
      fetchedAt: new Date(Date.now() - METADATA_DOCUMENT_TTL_MS - 1000),
    } as never);

    await resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.oAuthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ name: "Claude Code", redirectUris: DOCUMENT.redirect_uris }) as unknown }),
    );
  });

  it("refuses a host that resolves to a private address, without fetching", async () => {
    const result = await resolve({ resolveHost: resolvePrivate });

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/private or loopback/) as unknown });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it("refuses a literal private address, without fetching", async () => {
    const result = await resolveMetadataClient(db, "https://169.254.169.254/latest/meta-data", {
      getDocument: fetchMock,
      resolveHost: resolvePublic,
    });

    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a document whose client_id is not its own URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...DOCUMENT, client_id: "https://evil.example/client.json" }));

    expect(await resolve()).toEqual({ ok: false, message: expect.stringMatching(/different client_id/) as unknown });
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["a redirect (never followed)", () => ({ status: 302, body: "" }), /HTTP 302/],
    ["a 404", () => ({ status: 404, body: "" }), /HTTP 404/],
    ["a body that is not JSON", () => jsonResponse("<html>"), /not JSON/],
    ["a document over 64 KB", () => jsonResponse({ ...DOCUMENT, padding: "x".repeat(70 * 1024) }), /64 KB/],
    ["a confidential client", () => jsonResponse({ ...DOCUMENT, token_endpoint_auth_method: "private_key_jwt" }), /only public clients/],
    ["a plain-http redirect URI", () => jsonResponse({ ...DOCUMENT, redirect_uris: ["http://evil.example/cb"] }), /not usable/],
    ["no redirect URIs", () => jsonResponse({ ...DOCUMENT, redirect_uris: [] }), /not usable/],
  ])("refuses %s", async (_label, response, message) => {
    fetchMock.mockResolvedValue(response());

    expect(await resolve()).toEqual({ ok: false, message: expect.stringMatching(message) as unknown });
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it("refuses when the fetch itself fails, even with a stale copy cached", async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      id: "cuid-1",
      kind: "metadata",
      name: "Claude Code",
      redirectUris: DOCUMENT.redirect_uris,
      metadataUrl: URL_ID,
      fetchedAt: new Date(Date.now() - METADATA_DOCUMENT_TTL_MS - 1000),
    } as never);
    fetchMock.mockRejectedValue(new Error("timeout"));

    expect(await resolve()).toEqual({ ok: false, message: expect.stringMatching(/could not be fetched/) as unknown });
  });

  it("names the refused address when the connection's own lookup finds a private one", async () => {
    // The guard saw a public address; the second lookup, at connect time, did not.
    fetchMock.mockRejectedValue(Object.assign(new Error("refused"), { code: "EPRIVATEADDRESS" }));

    expect(await resolve()).toEqual({ ok: false, message: "claude.ai resolves to a private or loopback address" });
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it("names a client that sends no name after its host", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ client_id: URL_ID, redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }));

    expect(await resolve()).toMatchObject({ ok: true, client: { name: "claude.ai" } });
  });
});

describe("publicOnlyLookup (the DNS rebinding defence)", () => {
  type Answer = { address: string; family: number }[];
  const lookupWith = (answer: Answer) =>
    ((_host: string, _options: unknown, callback: (error: null, addresses: Answer) => void) => callback(null, answer)) as never;

  function run(answer: Answer, options: { all?: boolean }, allowLoopback = false) {
    return new Promise<{ error: NodeJS.ErrnoException | null; address: unknown; family?: number }>((done) => {
      publicOnlyLookup(allowLoopback, lookupWith(answer))("rebind.example", options as never, (error, address, family) =>
        done({ error, address, family }),
      );
    });
  }

  it("passes a public answer through, as one address or as the list", async () => {
    expect(await run([{ address: "160.79.104.10", family: 4 }], {})).toEqual({ error: null, address: "160.79.104.10", family: 4 });
    expect(await run([{ address: "160.79.104.10", family: 4 }], { all: true })).toMatchObject({
      error: null,
      address: [{ address: "160.79.104.10", family: 4 }],
    });
  });

  it.each([
    ["a private address", [{ address: "10.0.0.5", family: 4 }]],
    ["cloud metadata", [{ address: "169.254.169.254", family: 4 }]],
    ["loopback", [{ address: "127.0.0.1", family: 4 }]],
    ["a mix of public and private", [{ address: "160.79.104.10", family: 4 }, { address: "192.168.1.1", family: 4 }]],
    ["no answer at all", []],
  ])("refuses %s at connect time, whatever the earlier check saw", async (_label, answer) => {
    const { error } = await run(answer, { all: true });

    expect(error?.code).toBe("EPRIVATEADDRESS");
  });

  it("lets loopback through only when told to (localhost outside production)", async () => {
    expect((await run([{ address: "127.0.0.1", family: 4 }], {}, true)).error).toBeNull();
  });
});
