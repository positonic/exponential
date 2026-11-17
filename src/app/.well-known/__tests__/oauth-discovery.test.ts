/**
 * OAuth discovery for MCP clients (hosted MCP Agent PRD, D1 and D9): the
 * protected-resource metadata at both well-known paths and the
 * authorization-server metadata, gated on `MCP_OAUTH_MODE`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

const envOverrides = vi.hoisted(() => ({ MCP_OAUTH_MODE: undefined as "off" | "admin" | "on" | undefined }));
vi.mock("~/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/env")>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) => (key in envOverrides ? envOverrides[key as keyof typeof envOverrides] : Reflect.get(target, key)),
    }),
  };
});

import * as resourceRoot from "../oauth-protected-resource/route";
import * as resourceForMcp from "../oauth-protected-resource/api/mcp/route";
import * as authServer from "../oauth-authorization-server/route";

const ISSUER = "https://app.example.test";

const ROUTES = [
  ["/.well-known/oauth-protected-resource", resourceRoot],
  ["/.well-known/oauth-protected-resource/api/mcp", resourceForMcp],
  ["/.well-known/oauth-authorization-server", authServer],
] as const;

beforeEach(() => {
  envOverrides.MCP_OAUTH_MODE = undefined;
});

describe("with MCP_OAUTH_MODE unset or off", () => {
  it.each(ROUTES)("%s is 404", async (_path, route) => {
    for (const mode of [undefined, "off"] as const) {
      envOverrides.MCP_OAUTH_MODE = mode;
      expect((await route.GET()).status).toBe(404);
      expect((await route.OPTIONS()).status).toBe(404);
    }
  });
});

describe.each(["admin", "on"] as const)("with MCP_OAUTH_MODE=%s", (mode) => {
  beforeEach(() => {
    envOverrides.MCP_OAUTH_MODE = mode;
  });

  it("serves the same protected-resource metadata at both paths", async () => {
    const atRoot: unknown = await (await resourceRoot.GET()).json();
    const atSuffix: unknown = await (await resourceForMcp.GET()).json();

    expect(atRoot).toEqual({
      resource: `${ISSUER}/api/mcp`,
      authorization_servers: [ISSUER],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
    });
    expect(atSuffix).toEqual(atRoot);
  });

  it("serves authorization-server metadata for what this install implements", async () => {
    const res = await authServer.GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/api/oauth/token`,
      registration_endpoint: `${ISSUER}/api/oauth/register`,
      revocation_endpoint: `${ISSUER}/api/oauth/revoke`,
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
    });
  });

  it.each(ROUTES)("%s is readable from any origin and never cached", async (_path, route) => {
    const res = await route.GET();

    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each(ROUTES)("%s answers a CORS preflight", async (_path, route) => {
    const res = await route.OPTIONS();

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET");
  });
});
