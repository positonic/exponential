/**
 * `POST /api/oauth/revoke` (RFC 7009; hosted MCP Agent PRD, D9), through the
 * real revocation logic over a mocked token table.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

const envOverrides = vi.hoisted(() => ({ MCP_OAUTH_MODE: "admin" as "off" | "admin" | "on" | undefined }));
vi.mock("~/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/env")>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) => (key in envOverrides ? envOverrides[key as keyof typeof envOverrides] : Reflect.get(target, key)),
    }),
  };
});

const { db, checkRateLimit } = vi.hoisted(() => {
  const db = {
    oAuthToken: { findUnique: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => Promise<unknown>) => fn(db));
  return { db, checkRateLimit: vi.fn() };
});
vi.mock("~/server/db", () => ({ db }));
vi.mock("~/server/utils/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/rateLimit")>()),
  checkRateLimit,
}));

import { hashOAuthSecret } from "~/server/mcp/oauth/tokens";
import { OPTIONS, POST } from "../route";

const ACCESS = "exp_oat_access-token";
const REFRESH = "exp_ort_refresh-token";
const ROW = { connection: { id: "conn-1", client: { id: "client-1", metadataUrl: null } } };

/** A revocation request as the server receives it (happy-dom would drop Content-Length). */
function revokeRequest(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  const req = new Request("http://localhost:3000/api/oauth/revoke", {
    method: "POST",
    body: new URLSearchParams(fields).toString(),
  });
  Object.defineProperty(req, "headers", {
    value: new Headers({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.7", ...headers }),
  });
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  envOverrides.MCP_OAUTH_MODE = "admin";
  checkRateLimit.mockResolvedValue({ success: true, retryAfterSeconds: 0 });
  db.oAuthToken.findUnique.mockResolvedValue(ROW);
  db.oAuthToken.deleteMany.mockResolvedValue({ count: 2 });
  db.$transaction.mockImplementation((fn: (tx: typeof db) => Promise<unknown>) => fn(db));
});

describe("POST /api/oauth/revoke", () => {
  it("revoking an access token deletes every token of its connection, with an empty 200", async () => {
    const res = await POST(revokeRequest({ token: ACCESS, token_type_hint: "access_token" }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(db.oAuthToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accessTokenHash: hashOAuthSecret(ACCESS) } }),
    );
    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { connectionId: "conn-1" } });
    // Under the connection's lock, taken first, so a refresh in flight can't slip a pair past it.
    expect(db.$queryRaw.mock.calls[0]?.slice(1)).toEqual(["conn-1"]);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.oAuthToken.deleteMany.mock.invocationCallOrder[0] ?? 0);
  });

  it("revoking a refresh token does the same, whatever the hint says", async () => {
    const res = await POST(revokeRequest({ token: REFRESH, token_type_hint: "access_token" }));

    expect(res.status).toBe(200);
    expect(db.oAuthToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { refreshTokenHash: hashOAuthSecret(REFRESH) } }),
    );
    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { connectionId: "conn-1" } });
  });

  it("answers 200 for an unknown token and revokes nothing", async () => {
    db.oAuthToken.findUnique.mockResolvedValue(null);

    const res = await POST(revokeRequest({ token: ACCESS }));

    expect(res.status).toBe(200);
    expect(db.oAuthToken.deleteMany).not.toHaveBeenCalled();
  });

  it("answers 200 for something that is not one of its tokens, without looking it up", async () => {
    const res = await POST(revokeRequest({ token: "exp_agent_not-an-oauth-token" }));

    expect(res.status).toBe(200);
    expect(db.oAuthToken.findUnique).not.toHaveBeenCalled();
    expect(db.oAuthToken.deleteMany).not.toHaveBeenCalled();
  });

  it("revokes nothing when another client's client_id comes with the token, and still answers 200", async () => {
    const res = await POST(revokeRequest({ token: ACCESS, client_id: "client-2" }));

    expect(res.status).toBe(200);
    expect(db.oAuthToken.deleteMany).not.toHaveBeenCalled();
  });

  it("revokes when the client_id is the token's client, by id or by metadata document URL", async () => {
    await POST(revokeRequest({ token: ACCESS, client_id: "client-1" }));
    expect(db.oAuthToken.deleteMany).toHaveBeenCalledTimes(1);

    const url = "https://claude.ai/oauth/claude-code-client-metadata";
    db.oAuthToken.findUnique.mockResolvedValue({ connection: { id: "conn-2", client: { id: "cuid-2", metadataUrl: url } } });
    await POST(revokeRequest({ token: ACCESS, client_id: url }));
    expect(db.oAuthToken.deleteMany).toHaveBeenLastCalledWith({ where: { connectionId: "conn-2" } });
  });

  it.each([
    ["no token", revokeRequest({ token_type_hint: "access_token" })],
    ["a JSON body", revokeRequest({ token: ACCESS }, { "content-type": "application/json" })],
  ])("refuses %s with invalid_request", async (_label, req) => {
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request" });
    expect(db.oAuthToken.deleteMany).not.toHaveBeenCalled();
  });

  it("shares the token endpoint's per-IP limit: 60 a minute", async () => {
    await POST(revokeRequest({ token: ACCESS }));
    expect(checkRateLimit).toHaveBeenCalledWith({ name: "oauth-token-ip", key: "203.0.113.7", limit: 60, windowSeconds: 60 });

    checkRateLimit.mockResolvedValue({ success: false, retryAfterSeconds: 12 });
    const res = await POST(revokeRequest({ token: ACCESS }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("answers a CORS preflight", async () => {
    const res = await OPTIONS();

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST");
  });

  it.each([undefined, "off"] as const)("is 404 with MCP_OAUTH_MODE=%s", async (mode) => {
    envOverrides.MCP_OAUTH_MODE = mode;

    expect((await POST(revokeRequest({ token: ACCESS }))).status).toBe(404);
    expect(db.oAuthToken.deleteMany).not.toHaveBeenCalled();
  });
});
