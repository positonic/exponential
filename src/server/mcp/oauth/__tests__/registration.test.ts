import { describe, it, expect } from "vitest";

import { MAX_CLIENT_NAME_LENGTH, MAX_REDIRECT_URIS, parseRegistration, registrationResponse, UNNAMED_CLIENT } from "../registration";

describe("parseRegistration", () => {
  it("keeps the name and the redirect URIs", () => {
    expect(
      parseRegistration({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }),
    ).toEqual({ ok: true, value: { name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] } });
  });

  it("ignores other metadata, including a requested secret-based auth method", () => {
    const result = parseRegistration({
      client_name: "Inspector",
      redirect_uris: ["http://localhost:6274/oauth/callback"],
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["authorization_code", "refresh_token"],
      logo_uri: "https://example.com/logo.png",
    });
    expect(result).toEqual({ ok: true, value: { name: "Inspector", redirectUris: ["http://localhost:6274/oauth/callback"] } });
  });

  it("drops duplicate redirect URIs", () => {
    const uri = "http://127.0.0.1:33418/cb";
    const result = parseRegistration({ client_name: "VS Code", redirect_uris: [uri, uri] });
    expect(result.ok && result.value.redirectUris).toEqual([uri]);
  });

  it("collapses whitespace in the name and cuts it to the limit", () => {
    const long = parseRegistration({ client_name: "x".repeat(300), redirect_uris: ["https://a.example/cb"] });
    expect(long.ok && long.value.name).toHaveLength(MAX_CLIENT_NAME_LENGTH);

    const spaced = parseRegistration({ client_name: "  Claude \n  Code  ", redirect_uris: ["https://a.example/cb"] });
    expect(spaced.ok && spaced.value.name).toBe("Claude Code");
  });

  it.each([undefined, "", "   "])("names a client that sends no name (%j)", (clientName) => {
    const result = parseRegistration({ client_name: clientName, redirect_uris: ["https://a.example/cb"] });
    expect(result.ok && result.value.name).toBe(UNNAMED_CLIENT);
  });

  it.each([
    ["no body object", null, "invalid_client_metadata"],
    ["an array body", [], "invalid_client_metadata"],
    ["no redirect_uris", { client_name: "x" }, "invalid_redirect_uri"],
    ["empty redirect_uris", { redirect_uris: [] }, "invalid_redirect_uri"],
    ["a non-array redirect_uris", { redirect_uris: "https://a.example/cb" }, "invalid_redirect_uri"],
    ["a non-https, non-loopback redirect", { redirect_uris: ["http://evil.example/cb"] }, "invalid_redirect_uri"],
    ["one bad redirect among good ones", { redirect_uris: ["https://a.example/cb", "javascript:alert(1)"] }, "invalid_redirect_uri"],
    ["a non-string redirect", { redirect_uris: [42] }, "invalid_redirect_uri"],
    ["too many redirects", { redirect_uris: Array.from({ length: MAX_REDIRECT_URIS + 1 }, (_, i) => `https://a.example/${i}`) }, "invalid_redirect_uri"],
    ["a non-string name", { client_name: 7, redirect_uris: ["https://a.example/cb"] }, "invalid_client_metadata"],
  ] as const)("refuses %s", (_label, body, error) => {
    const result = parseRegistration(body);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.error).toBe(error);
  });
});

describe("registrationResponse", () => {
  it("describes a public client: no secret, PKCE at the token endpoint", () => {
    const response = registrationResponse({
      id: "client-1",
      name: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      createdAt: new Date("2026-11-16T12:00:00.000Z"),
    });
    expect(response).toEqual({
      client_id: "client-1",
      client_id_issued_at: 1794830400,
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    expect(response).not.toHaveProperty("client_secret");
  });
});
