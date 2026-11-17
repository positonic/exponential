/**
 * `POST /api/oauth/register` (hosted MCP Agent PRD, D9): dynamic client
 * registration for MCP clients. Prisma and the rate limiter are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
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

const { db, checkRateLimit } = vi.hoisted(() => ({
  db: { oAuthClient: { create: vi.fn() } },
  checkRateLimit: vi.fn(),
}));
vi.mock("~/server/db", () => ({ db }));
vi.mock("~/server/utils/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/rateLimit")>()),
  checkRateLimit,
}));

import { OPTIONS, POST } from "../route";

const CREATED_AT = new Date("2026-11-16T12:00:00.000Z");

/**
 * A request as the server receives it. happy-dom (registered globally by
 * `src/test/setup.ts`) drops headers a browser may not set, such as
 * `Content-Length`; a server sees them. So the headers go on as a standalone
 * `Headers`.
 */
function register(body: unknown, headers: Record<string, string> = {}): Request {
  const req = new Request("http://localhost:3000/api/oauth/register", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  Object.defineProperty(req, "headers", {
    value: new Headers({ "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers }),
  });
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  envOverrides.MCP_OAUTH_MODE = "admin";
  checkRateLimit.mockResolvedValue({ success: true, retryAfterSeconds: 0 });
  db.oAuthClient.create.mockImplementation(({ data }: { data: { name: string; redirectUris: string[] } }) =>
    Promise.resolve({ id: "client-1", name: data.name, redirectUris: data.redirectUris, createdAt: CREATED_AT }),
  );
});

describe("POST /api/oauth/register", () => {
  it("registers a public client and returns its client_id, with no secret", async () => {
    const res = await POST(register({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }));

    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      client_id: "client-1",
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
    });
    expect(body).not.toHaveProperty("client_secret");
    expect(db.oAuthClient.create).toHaveBeenCalledWith({
      data: { kind: "registered", name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] },
      select: { id: true, name: true, redirectUris: true, createdAt: true },
    });
  });

  it("accepts loopback http for desktop and CLI clients", async () => {
    const res = await POST(register({ client_name: "Claude Code", redirect_uris: ["http://localhost:51234/callback"] }));

    expect(res.status).toBe(201);
  });

  it("refuses a non-https, non-loopback redirect and stores nothing", async () => {
    const res = await POST(register({ client_name: "Evil", redirect_uris: ["http://evil.example/callback"] }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_redirect_uri" });
    expect(db.oAuthClient.create).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    const res = await POST(register("client_name=x"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_client_metadata" });
  });

  it("refuses an oversized body before reading it", async () => {
    const res = await POST(register({ redirect_uris: ["https://a.example/cb"] }, { "content-length": String(1024 * 1024) }));

    expect(res.status).toBe(400);
    expect(db.oAuthClient.create).not.toHaveBeenCalled();
  });

  it("limits registrations per IP: 20 an hour", async () => {
    await POST(register({ redirect_uris: ["https://a.example/cb"] }));

    expect(checkRateLimit).toHaveBeenCalledWith({
      name: "oauth-register-ip",
      key: "203.0.113.7",
      limit: 20,
      windowSeconds: 3600,
    });
  });

  it("answers 429 with Retry-After over the limit and stores nothing", async () => {
    checkRateLimit.mockResolvedValue({ success: false, retryAfterSeconds: 1200 });

    const res = await POST(register({ redirect_uris: ["https://a.example/cb"] }));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1200");
    expect(db.oAuthClient.create).not.toHaveBeenCalled();
  });

  it("answers a CORS preflight", async () => {
    const res = await OPTIONS();

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toBe("POST");
  });

  it.each([undefined, "off"] as const)("is 404 with MCP_OAUTH_MODE=%s", async (mode) => {
    envOverrides.MCP_OAUTH_MODE = mode;

    const res = await POST(register({ redirect_uris: ["https://a.example/cb"] }));

    expect(res.status).toBe(404);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(db.oAuthClient.create).not.toHaveBeenCalled();
  });
});
