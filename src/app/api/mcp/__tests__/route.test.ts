/**
 * The hosted MCP endpoint (`/api/mcp`, hosted MCP Agent PRD, D4 and Seam 1).
 * Real `Request` objects go through the exported handlers, and credentials go
 * through the real bearer resolver: real-format agent keys and real signed
 * JWTs. Prisma, NextAuth, the tRPC handler and analytics are mocked, so what is
 * under test is the route's own decisions and the MCP protocol it speaks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import superjson from "superjson";
import { listTools } from "exponential-mcp/tools";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "mcp-route-test-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

/** `env` as the route reads it, with MCP_ALLOWED_ORIGINS settable per test. */
const envOverrides = vi.hoisted(() => ({ MCP_ALLOWED_ORIGINS: undefined as string | undefined }));
vi.mock("~/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/env")>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) => (key in envOverrides ? envOverrides[key as keyof typeof envOverrides] : Reflect.get(target, key)),
    }),
  };
});

const { db, auth, handleTRPCRequest, checkRateLimit } = vi.hoisted(() => ({
  db: {
    externalAgentKey: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  auth: vi.fn(),
  handleTRPCRequest: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("~/server/db", () => ({ db }));
vi.mock("~/server/auth", () => ({ auth }));
vi.mock("~/server/analytics/posthog", () => ({ flushAnalytics: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("~/server/api/fetchHandler", () => ({ handleTRPCRequest }));
vi.mock("~/server/utils/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/rateLimit")>()),
  checkRateLimit,
}));

import { DELETE, GET, OPTIONS, POST } from "../route";
import { generateJWT, type JWTTokenType } from "~/server/utils/jwt";
import { generateExternalAgentKey, hashExternalAgentKey } from "~/server/utils/external-agent-keys";

const AGENT_KEY = generateExternalAgentKey().secret;
const SHADOW = { id: "user-shadow", email: null, name: "Claude", image: null };
const PERSON = { id: "user-person", email: "person@example.test", name: "Person", image: null, isAdmin: false };
const RUN_TOOLS = ["report_progress", "ask_owner", "finish_run"];

let rpcId = 0;
function rpc(method: string, params: Record<string, unknown> = {}) {
  rpcId += 1;
  return { jsonrpc: "2.0", id: rpcId, method, params };
}

const INITIALIZE = () =>
  rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });

/**
 * A request as the server receives it. happy-dom, registered globally by
 * `src/test/setup.ts`, drops `Origin` from a Request's headers as a browser
 * would; a server sees it. So the headers go on as a standalone `Headers`.
 */
function serverRequest(method: string, body: unknown, headers: Record<string, string>): Request {
  const req = new Request("http://localhost:3000/api/mcp", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  Object.defineProperty(req, "headers", { value: new Headers(headers) });
  return req;
}

function mcpRequest(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${AGENT_KEY}` }): Request {
  return serverRequest("POST", body, {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...headers,
  });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** A tRPC batch response carrying one superjson-encoded result. */
function trpcBatchResponse(data: unknown): Response {
  return new Response(JSON.stringify([{ result: { data: superjson.serialize(data) } }]), {
    headers: { "content-type": "application/json" },
  });
}

const globalFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  envOverrides.MCP_ALLOWED_ORIGINS = undefined;
  checkRateLimit.mockResolvedValue({ success: true, retryAfterSeconds: 0 });
  vi.stubGlobal("fetch", globalFetch);
  auth.mockResolvedValue({ user: { id: PERSON.id }, expires: "2099-01-01T00:00:00.000Z" });
  db.externalAgentKey.update.mockResolvedValue({});
  db.externalAgentKey.findUnique.mockImplementation(({ where }: { where: { keyHash: string } }) =>
    Promise.resolve(
      where.keyHash === hashExternalAgentKey(AGENT_KEY)
        ? { id: "key-1", expiresAt: null, agent: { shadowUser: SHADOW } }
        : null,
    ),
  );
  db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === PERSON.id ? PERSON : null),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/mcp with an agent key", () => {
  it("answers initialize without issuing a session", async () => {
    const res = await POST(mcpRequest(INITIALIZE()));

    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = (await res.json()) as { result: { serverInfo: { name: string }; capabilities: unknown } };
    expect(body.result.serverInfo.name).toBe("exponential");
    expect(body.result.capabilities).toEqual({ tools: {} });
  });

  it("lists the stdio registry's tools without the run tools", async () => {
    const res = await POST(mcpRequest(rpc("tools/list")));

    expect(res.status).toBe(200);
    const { result } = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(result.tools).toEqual(JSON.parse(JSON.stringify(listTools())));
    const names = result.tools.map((t) => t.name);
    for (const runTool of RUN_TOOLS) expect(names).not.toContain(runTool);
  });

  it("runs a tool call in-process through tRPC as the agent", async () => {
    handleTRPCRequest.mockResolvedValue(trpcBatchResponse([{ id: "w1", slug: "acme", name: "Acme" }]));

    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} })));

    expect(res.status).toBe(200);
    const { result } = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual([{ id: "w1", slug: "acme", name: "Acme" }]);

    expect(handleTRPCRequest).toHaveBeenCalledTimes(1);
    const [trpcReq, createContext] = handleTRPCRequest.mock.calls[0] as [Request, () => unknown];
    expect(new URL(trpcReq.url).pathname).toBe("/api/trpc/workspace.list");
    expect(createContext()).toMatchObject({
      db,
      session: { user: { id: SHADOW.id, isAdmin: false } },
      tokenType: "agent-key",
    });
    // Nothing went over the network.
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("refuses a run tool", async () => {
    const res = await POST(mcpRequest(rpc("tools/call", { name: "finish_run", arguments: { summary: "x", readyToClose: true } })));

    const { result } = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Unknown tool: finish_run/);
    expect(handleTRPCRequest).not.toHaveBeenCalled();
  });
});

describe("POST /api/mcp credentials", () => {
  it("accepts a person's api-token JWT and runs as that person", async () => {
    handleTRPCRequest.mockResolvedValue(trpcBatchResponse([]));
    const token = generateJWT(PERSON, { tokenType: "api-token" });

    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} }), bearer(token)));

    expect(res.status).toBe(200);
    const [, createContext] = handleTRPCRequest.mock.calls[0] as [Request, () => unknown];
    expect(createContext()).toMatchObject({ session: { user: { id: PERSON.id } }, tokenType: "api-token" });
  });

  it.each<JWTTokenType>([
    "agent-context",
    "whatsapp-gateway",
    "telegram-gateway",
    "matrix-gateway",
    "voice-session",
    "device-token",
    "extension-token",
  ])("refuses a %s JWT with 401, though it is valid on /api/trpc", async (tokenType) => {
    const token = generateJWT(PERSON, { tokenType });

    const res = await POST(mcpRequest(rpc("tools/list"), bearer(token)));

    expect(res.status).toBe(401);
    expect(db.user.findUnique).toHaveBeenCalled(); // it did resolve; the route refused the type
    expect(handleTRPCRequest).not.toHaveBeenCalled();
  });

  it("never authenticates with a session cookie", async () => {
    const res = await POST(mcpRequest(rpc("tools/list"), { cookie: "authjs.session-token=valid-session" }));

    expect(res.status).toBe(401);
    expect(auth).not.toHaveBeenCalled();
  });
});

describe("POST /api/mcp protocol edges", () => {
  async function expectUnauthorized(res: Response, challenge: string) {
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(challenge);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(handleTRPCRequest).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/Unauthorized/);
  }

  it("401s with a bare Bearer challenge when there is no credential", async () => {
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"), {})), "Bearer");
  });

  it("401s with invalid_token for a token that is neither a key nor a valid JWT", async () => {
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"), bearer("not-a-token"))), 'Bearer error="invalid_token"');
  });

  it("401s for a revoked agent key (its row is gone)", async () => {
    const revoked = generateExternalAgentKey().secret;
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"), bearer(revoked))), 'Bearer error="invalid_token"');
  });

  it("401s for an expired agent key", async () => {
    db.externalAgentKey.findUnique.mockResolvedValue({
      id: "key-1",
      expiresAt: new Date(Date.now() - 1000),
      agent: { shadowUser: SHADOW },
    });
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"))), 'Bearer error="invalid_token"');
  });

  it("401s for an expired api-token JWT", async () => {
    const expired = generateJWT(PERSON, { tokenType: "api-token", expiryMinutes: -1 });
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"), bearer(expired))), 'Bearer error="invalid_token"');
  });

  it("runs no tool for an unauthenticated tools/call", async () => {
    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} }), {}));
    expect(res.status).toBe(401);
    expect(handleTRPCRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", GET],
    ["DELETE", DELETE],
  ])("answers %s with 405 and Allow: POST", async (_method, handler) => {
    const res = handler();

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });

  it("serves initialize and tools/list as two independent requests, with no session between them", async () => {
    const init = await POST(mcpRequest(INITIALIZE()));
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();

    // No Mcp-Session-Id sent back: a different instance could serve this one.
    const list = await POST(mcpRequest(rpc("tools/list"), { ...bearer(AGENT_KEY), "mcp-protocol-version": "2025-06-18" }));
    expect(list.status).toBe(200);
    expect(list.headers.get("mcp-session-id")).toBeNull();
    const { result } = (await list.json()) as { result: { tools: unknown[] } };
    expect(result.tools).toHaveLength(listTools().length);
  });
});

describe("POST /api/mcp origin allowlist", () => {
  const withOrigin = (origin: string) => ({ ...bearer(AGENT_KEY), origin });

  it("serves a request with no Origin and sends no CORS headers", async () => {
    const res = await POST(mcpRequest(rpc("tools/list")));

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves the app's own origin, with CORS headers for it", async () => {
    const res = await POST(mcpRequest(rpc("tools/list"), withOrigin("https://app.example.test")));

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.test");
    expect(res.headers.get("vary")).toBe("Origin");
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });

  it("serves an origin listed in MCP_ALLOWED_ORIGINS", async () => {
    envOverrides.MCP_ALLOWED_ORIGINS = "https://inspector.example.test/, https://other.example.test";

    const res = await POST(mcpRequest(rpc("tools/list"), withOrigin("https://inspector.example.test")));

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://inspector.example.test");
  });

  it("refuses a foreign origin with 403 before looking at the credential", async () => {
    envOverrides.MCP_ALLOWED_ORIGINS = "https://inspector.example.test";

    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} }), withOrigin("https://evil.example.test")));

    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(db.externalAgentKey.findUnique).not.toHaveBeenCalled();
    expect(handleTRPCRequest).not.toHaveBeenCalled();
  });

  it("refuses an opaque origin", async () => {
    const res = await POST(mcpRequest(rpc("tools/list"), withOrigin("null")));
    expect(res.status).toBe(403);
  });

  it("lets an allowed browser origin read a 401 and its challenge", async () => {
    const res = await POST(mcpRequest(rpc("tools/list"), { origin: "https://app.example.test" }));

    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.test");
    expect(res.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
  });

  it("answers a preflight from an allowed origin", () => {
    const res = OPTIONS(serverRequest("OPTIONS", undefined, { origin: "https://app.example.test" }));

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.test");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST");
    expect(res.headers.get("access-control-allow-headers")).toMatch(/Authorization/);
  });

  it("refuses a preflight from a foreign origin", () => {
    const res = OPTIONS(serverRequest("OPTIONS", undefined, { origin: "https://evil.example.test" }));

    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("POST /api/mcp rate limit", () => {
  it("counts each request against its principal: 120 a minute, keyed by the session user", async () => {
    await POST(mcpRequest(rpc("tools/list")));

    expect(checkRateLimit).toHaveBeenCalledWith({
      name: "mcp-principal",
      key: SHADOW.id,
      limit: 120,
      windowSeconds: 60,
    });
  });

  it("answers 429 with Retry-After over the limit and runs no tool", async () => {
    checkRateLimit.mockResolvedValue({ success: false, retryAfterSeconds: 17 });

    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} })));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("17");
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(handleTRPCRequest).not.toHaveBeenCalled();
  });

  it("keeps CORS headers on a 429 for an allowed origin", async () => {
    checkRateLimit.mockResolvedValue({ success: false, retryAfterSeconds: 5 });

    const res = await POST(mcpRequest(rpc("tools/list"), { ...bearer(AGENT_KEY), origin: "https://app.example.test" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.test");
  });

  it("does not spend a principal's budget on a request that fails authentication", async () => {
    await POST(mcpRequest(rpc("tools/list"), bearer("not-a-token")));
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
