import { describe, it, expect } from "vitest";

import { clientKeyFor, describeRedirectTarget, redirectUriMatches } from "../clients";

describe("redirectUriMatches", () => {
  it("matches a registered URI exactly", () => {
    expect(redirectUriMatches(["https://claude.ai/api/mcp/auth_callback"], "https://claude.ai/api/mcp/auth_callback")).toBe(true);
  });

  it("matches a loopback URI on any port (RFC 8252 §7.3)", () => {
    expect(redirectUriMatches(["http://127.0.0.1:33418/callback"], "http://127.0.0.1:51001/callback")).toBe(true);
    expect(redirectUriMatches(["http://localhost/callback"], "http://localhost:6274/callback")).toBe(true);
  });

  it.each([
    ["https on another port", ["https://claude.ai/cb"], "https://claude.ai:8443/cb"],
    ["https on another path", ["https://claude.ai/cb"], "https://claude.ai/cb/extra"],
    ["https with an extra query", ["https://claude.ai/cb"], "https://claude.ai/cb?x=1"],
    ["loopback on another path", ["http://127.0.0.1:33418/callback"], "http://127.0.0.1:33418/other"],
    ["loopback on another host", ["http://127.0.0.1:33418/callback"], "http://localhost:33418/callback"],
    ["remote http dressed as loopback", ["http://127.0.0.1/cb"], "http://evil.example/cb"],
    ["a private-use URI that differs", ["cursor://anysphere.cursor-retrieval/oauth/cb"], "cursor://anysphere.cursor-retrieval/oauth/other"],
    ["nothing registered", [], "https://claude.ai/cb"],
  ])("refuses %s", (_label, registered, presented) => {
    expect(redirectUriMatches(registered, presented)).toBe(false);
  });
});

describe("clientKeyFor", () => {
  it("is the lower-cased name plus the sorted, de-duplicated redirect hosts", () => {
    expect(
      clientKeyFor({
        kind: "registered",
        name: "Claude",
        redirectUris: ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/cb", "https://claude.ai/other"],
      }),
    ).toBe("claude|claude.ai claude.com");
  });

  it("writes any loopback host as loopback and a private-use URI as its scheme", () => {
    expect(
      clientKeyFor({
        kind: "registered",
        name: "Cursor",
        redirectUris: ["cursor://anysphere.cursor-retrieval/oauth/cb", "http://127.0.0.1:5000/cb", "http://localhost/cb"],
      }),
    ).toBe("cursor|cursor: loopback");
  });

  it("is stable across re-registrations of the same client (new port, same hosts)", () => {
    const first = clientKeyFor({ kind: "registered", name: "Claude Code", redirectUris: ["http://localhost:51234/callback"] });
    const again = clientKeyFor({ kind: "registered", name: "claude code", redirectUris: ["http://localhost:60111/callback"] });
    expect(again).toBe(first);
  });

  it("differs for a client that copies a name but redirects elsewhere", () => {
    const real = clientKeyFor({ kind: "registered", name: "Claude", redirectUris: ["https://claude.ai/cb"] });
    const copy = clientKeyFor({ kind: "registered", name: "Claude", redirectUris: ["https://evil.example/cb"] });
    expect(copy).not.toBe(real);
  });

  it("is the document URL for a metadata-document client", () => {
    expect(
      clientKeyFor({ kind: "metadata", name: "X", redirectUris: [], metadataUrl: "https://client.example/oauth.json" }),
    ).toBe("https://client.example/oauth.json");
  });
});

describe("describeRedirectTarget", () => {
  it.each([
    ["https://claude.ai/api/mcp/auth_callback", "claude.ai"],
    ["http://127.0.0.1:33418/cb", "an app on this computer (127.0.0.1)"],
    ["cursor://anysphere.cursor-retrieval/oauth/cb", "the cursor:// app on this device"],
  ])("describes %s as %s", (uri, words) => {
    expect(describeRedirectTarget(uri)).toBe(words);
  });
});
