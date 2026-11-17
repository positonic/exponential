/**
 * Validating `/oauth/authorize` requests (hosted MCP Agent PRD, D11): what
 * renders an error page, what redirects the OAuth error to the client.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

import { validateAuthorizeRequest, type AuthorizeParams } from "../authorizeRequest";

const CLIENT = {
  id: "client-1",
  kind: "registered",
  name: "Claude",
  redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  metadataUrl: null,
};
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const findUnique = vi.fn();
const db = { oAuthClient: { findUnique } } as unknown as Pick<PrismaClient, "oAuthClient">;

function params(overrides: Partial<AuthorizeParams> = {}): AuthorizeParams {
  return {
    response_type: "code",
    client_id: CLIENT.id,
    redirect_uri: CLIENT.redirectUris[0],
    state: "st-123",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: "https://app.example.test/api/mcp",
    ...overrides,
  };
}

/** The OAuth parameters on a redirect-error result. */
async function redirectedError(overrides: Partial<AuthorizeParams>) {
  const result = await validateAuthorizeRequest(db, params(overrides));
  expect(result.kind).toBe("redirect-error");
  const url = new URL(result.kind === "redirect-error" ? result.redirectTo : "");
  return { url, error: url.searchParams.get("error"), state: url.searchParams.get("state"), iss: url.searchParams.get("iss") };
}

beforeEach(() => {
  findUnique.mockReset();
  findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === CLIENT.id ? CLIENT : null),
  );
});

describe("validateAuthorizeRequest", () => {
  it("accepts a complete request", async () => {
    expect(await validateAuthorizeRequest(db, params())).toEqual({
      kind: "valid",
      request: {
        client: CLIENT,
        redirectUri: CLIENT.redirectUris[0],
        state: "st-123",
        codeChallenge: CHALLENGE,
        resource: "https://app.example.test/api/mcp",
      },
    });
  });

  it("takes a missing resource to mean the MCP endpoint", async () => {
    const result = await validateAuthorizeRequest(db, params({ resource: undefined }));
    expect(result.kind === "valid" && result.request.resource).toBe("https://app.example.test/api/mcp");
  });

  it("uses the only registered redirect URI when none is sent", async () => {
    const result = await validateAuthorizeRequest(db, params({ redirect_uri: undefined }));
    expect(result.kind === "valid" && result.request.redirectUri).toBe(CLIENT.redirectUris[0]);
  });

  describe("renders an error page and never redirects", () => {
    it.each([
      ["no client_id", { client_id: undefined }],
      ["an unknown client", { client_id: "nobody" }],
      ["a redirect URI the client did not register", { redirect_uri: "https://evil.example/cb" }],
    ])("for %s", async (_label, overrides) => {
      const result = await validateAuthorizeRequest(db, params(overrides));
      expect(result.kind).toBe("invalid-client");
    });

    it("when the redirect URI is missing and the client registered several", async () => {
      findUnique.mockResolvedValue({ ...CLIENT, redirectUris: ["https://claude.ai/a", "https://claude.ai/b"] });
      const result = await validateAuthorizeRequest(db, params({ redirect_uri: undefined }));
      expect(result.kind).toBe("invalid-client");
    });
  });

  describe("redirects the OAuth error to the client, with state and iss", () => {
    it("for a response type other than code", async () => {
      const { url, error, state, iss } = await redirectedError({ response_type: "token" });
      expect(url.origin + url.pathname).toBe(CLIENT.redirectUris[0]);
      expect(error).toBe("unsupported_response_type");
      expect(state).toBe("st-123");
      expect(iss).toBe("https://app.example.test");
    });

    it.each([
      ["no PKCE challenge", { code_challenge: undefined, code_challenge_method: undefined }],
      ["the plain method", { code_challenge_method: "plain" }],
      ["no method", { code_challenge_method: undefined }],
      ["a malformed challenge", { code_challenge: "too-short" }],
    ])("for %s", async (_label, overrides) => {
      expect((await redirectedError(overrides)).error).toBe("invalid_request");
    });

    it("for a resource other than the MCP endpoint", async () => {
      expect((await redirectedError({ resource: "https://other.example/api/mcp" })).error).toBe("invalid_target");
    });

    it("leaves state out when the client sent none", async () => {
      expect((await redirectedError({ response_type: "token", state: undefined })).state).toBeNull();
    });
  });
});
