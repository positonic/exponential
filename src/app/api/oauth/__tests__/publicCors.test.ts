/**
 * Every public OAuth route answers any origin (hosted MCP Agent PRD, D9): the
 * well-known documents, register, token and revoke carry no cookies and serve
 * public clients, so a browser-based client can call them, read the answer,
 * and read the error too. One test over all of them, so a route added later
 * without the headers fails here.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

vi.mock("~/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/env")>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) => (key === "MCP_OAUTH_MODE" ? "on" : Reflect.get(target, key)),
    }),
  };
});
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/utils/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/rateLimit")>()),
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, retryAfterSeconds: 0 }),
}));

import * as protectedResource from "~/app/.well-known/oauth-protected-resource/route";
import * as protectedResourceMcp from "~/app/.well-known/oauth-protected-resource/api/mcp/route";
import * as authServer from "~/app/.well-known/oauth-authorization-server/route";
import * as register from "../register/route";
import * as revoke from "../revoke/route";
import * as token from "../token/route";

const PREFLIGHTS = [
  ["/.well-known/oauth-protected-resource", protectedResource.OPTIONS],
  ["/.well-known/oauth-protected-resource/api/mcp", protectedResourceMcp.OPTIONS],
  ["/.well-known/oauth-authorization-server", authServer.OPTIONS],
  ["/api/oauth/register", register.OPTIONS],
  ["/api/oauth/token", token.OPTIONS],
  ["/api/oauth/revoke", revoke.OPTIONS],
] as const;

/** A malformed POST: each endpoint must refuse it with a body any origin can read. */
const badPost = () =>
  new Request("https://app.example.test/x", { method: "POST", body: "not json, not a form" });

describe("public OAuth routes answer any origin", () => {
  it.each(PREFLIGHTS)("%s answers OPTIONS with Access-Control-Allow-Origin: *", async (_path, OPTIONS) => {
    const res = await OPTIONS();

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it.each([
    ["/api/oauth/register", register.POST],
    ["/api/oauth/token", token.POST],
    ["/api/oauth/revoke", revoke.POST],
  ] as const)("%s refuses a malformed request with an error any origin can read", async (_path, POST) => {
    const res = await POST(badPost());

    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
