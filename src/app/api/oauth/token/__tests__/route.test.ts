/**
 * `POST /api/oauth/token` (hosted MCP Agent PRD, D9): the request shape the
 * endpoint accepts. The grant itself is tested in tokenGrant.test.ts; here it
 * is mocked.
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

const { redeemAuthorizationCode, redeemRefreshToken, checkRateLimit } = vi.hoisted(() => ({
  redeemAuthorizationCode: vi.fn(),
  redeemRefreshToken: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/mcp/oauth/tokenGrant", () => ({ redeemAuthorizationCode, redeemRefreshToken }));
vi.mock("~/server/utils/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/rateLimit")>()),
  checkRateLimit,
}));

import { OPTIONS, POST } from "../route";

const TOKENS = {
  access_token: "exp_oat_x",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "exp_ort_x",
  scope: "mcp",
};
const GRANT = {
  grant_type: "authorization_code",
  code: "exp_oac_x",
  client_id: "client-1",
  redirect_uri: "http://127.0.0.1:41234/callback",
  code_verifier: "v".repeat(43),
};

/** A token request as the server receives it (happy-dom would drop Content-Length). */
function tokenRequest(body: string, headers: Record<string, string> = {}): Request {
  const req = new Request("http://localhost:3000/api/oauth/token", { method: "POST", body });
  Object.defineProperty(req, "headers", {
    value: new Headers({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.7", ...headers }),
  });
  return req;
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

beforeEach(() => {
  vi.clearAllMocks();
  envOverrides.MCP_OAUTH_MODE = "admin";
  checkRateLimit.mockResolvedValue({ success: true, retryAfterSeconds: 0 });
  redeemAuthorizationCode.mockResolvedValue({ ok: true, tokens: TOKENS });
  redeemRefreshToken.mockResolvedValue({ ok: true, tokens: TOKENS });
});

const REFRESH = { grant_type: "refresh_token", refresh_token: "exp_ort_old", client_id: "client-1" };

describe("POST /api/oauth/token", () => {
  it("exchanges a code for tokens, uncacheable and readable from any origin", async () => {
    const res = await POST(tokenRequest(form(GRANT)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(TOKENS);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(redeemAuthorizationCode).toHaveBeenCalledWith(
      {},
      { code: GRANT.code, clientId: GRANT.client_id, redirectUri: GRANT.redirect_uri, codeVerifier: GRANT.code_verifier },
    );
  });

  it("passes the grant's refusal on as a 400", async () => {
    redeemAuthorizationCode.mockResolvedValue({ ok: false, error: "invalid_grant", description: "nope" });

    const res = await POST(tokenRequest(form(GRANT)));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_grant", error_description: "nope" });
  });

  it("accepts the MCP endpoint as the resource, and refuses any other", async () => {
    expect((await POST(tokenRequest(form({ ...GRANT, resource: "https://app.example.test/api/mcp" })))).status).toBe(200);

    const other = await POST(tokenRequest(form({ ...GRANT, resource: "https://other.example/api/mcp" })));
    expect(other.status).toBe(400);
    expect(await other.json()).toMatchObject({ error: "invalid_target" });
  });

  it("refreshes: a refresh token and client_id get a new pair, uncacheable", async () => {
    const res = await POST(tokenRequest(form(REFRESH)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(TOKENS);
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(redeemRefreshToken).toHaveBeenCalledWith({}, { refreshToken: "exp_ort_old", clientId: "client-1" });
    expect(redeemAuthorizationCode).not.toHaveBeenCalled();
  });

  it("passes a refused refresh on as invalid_grant", async () => {
    redeemRefreshToken.mockResolvedValue({ ok: false, error: "invalid_grant", description: "expired" });

    const res = await POST(tokenRequest(form(REFRESH)));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_grant", error_description: "expired" });
  });

  it.each([
    ["no refresh_token", form({ grant_type: "refresh_token", client_id: "client-1" }), "invalid_request"],
    ["no client_id", form({ grant_type: "refresh_token", refresh_token: "exp_ort_old" }), "invalid_request"],
    ["a wider scope", form({ ...REFRESH, scope: "mcp admin" }), "invalid_scope"],
    ["another resource", form({ ...REFRESH, resource: "https://other.example/api/mcp" }), "invalid_target"],
  ])("refuses a refresh with %s", async (_label, body, error) => {
    const res = await POST(tokenRequest(body));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error });
    expect(redeemRefreshToken).not.toHaveBeenCalled();
  });

  it("accepts a refresh that names the one scope", async () => {
    expect((await POST(tokenRequest(form({ ...REFRESH, scope: "mcp" })))).status).toBe(200);
  });

  it("refuses any other grant type", async () => {
    const res = await POST(tokenRequest(form({ grant_type: "client_credentials", client_id: "client-1" })));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "unsupported_grant_type" });
  });

  it.each([
    ["no code_verifier", form({ ...GRANT, code_verifier: "" })],
    ["no client_id", form({ grant_type: "authorization_code", code: "c", redirect_uri: "r", code_verifier: "v" })],
    ["a repeated parameter", `${form(GRANT)}&code=again`],
  ])("refuses %s with invalid_request", async (_label, body) => {
    const res = await POST(tokenRequest(body));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request" });
    expect(redeemAuthorizationCode).not.toHaveBeenCalled();
  });

  it("refuses a JSON body: the token endpoint is form-encoded", async () => {
    const res = await POST(tokenRequest(JSON.stringify(GRANT), { "content-type": "application/json" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("limits token requests per IP: 60 a minute", async () => {
    await POST(tokenRequest(form(GRANT)));
    expect(checkRateLimit).toHaveBeenCalledWith({ name: "oauth-token-ip", key: "203.0.113.7", limit: 60, windowSeconds: 60 });

    checkRateLimit.mockResolvedValue({ success: false, retryAfterSeconds: 30 });
    const res = await POST(tokenRequest(form(GRANT)));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("answers a CORS preflight", async () => {
    expect((await OPTIONS()).status).toBe(204);
  });

  it.each([undefined, "off"] as const)("is 404 with MCP_OAUTH_MODE=%s", async (mode) => {
    envOverrides.MCP_OAUTH_MODE = mode;

    expect((await POST(tokenRequest(form(GRANT)))).status).toBe(404);
    expect(redeemAuthorizationCode).not.toHaveBeenCalled();
  });
});
