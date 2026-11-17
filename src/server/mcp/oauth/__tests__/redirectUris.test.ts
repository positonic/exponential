import { describe, it, expect } from "vitest";

import { classifyRedirectUri, MAX_REDIRECT_URI_LENGTH } from "../redirectUris";

describe("classifyRedirectUri", () => {
  it.each([
    ["https://claude.ai/api/mcp/auth_callback", "https"],
    ["https://vscode.dev/redirect", "https"],
    ["https://localhost:8443/cb", "https"],
    ["http://127.0.0.1:33418/callback", "loopback"],
    ["http://localhost:6274/oauth/callback", "loopback"],
    ["http://[::1]:5000/cb", "loopback"],
    ["http://127.0.0.1/cb", "loopback"],
    ["cursor://anysphere.cursor-retrieval/oauth/user-exponential/callback", "private-use"],
    ["com.example.app:/oauth2redirect", "private-use"],
  ] as const)("accepts %s as %s", (uri, kind) => {
    expect(classifyRedirectUri(uri)).toBe(kind);
  });

  it.each([
    // Plain http off the machine: the code would cross the network in the clear.
    "http://example.com/callback",
    "http://localhost.evil.example/cb",
    "http://127.0.0.1.nip.io/cb",
    "http://0.0.0.0:3000/cb",
    "http://192.168.1.10/cb",
    // Not redirects at all.
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "vbscript:msgbox",
    "about:blank",
    "blob:https://example.com/uuid",
    // Fragments are forbidden (RFC 6749 §3.1.2), credentials never belong here.
    "https://example.com/cb#frag",
    "https://example.com/cb#",
    "https://user:pass@example.com/cb",
    // Not URIs.
    "",
    "not a uri",
    "/relative/path",
  ])("refuses %s", (uri) => {
    expect(classifyRedirectUri(uri)).toBeNull();
  });

  it("refuses a URI longer than the cap", () => {
    const uri = `https://example.com/${"a".repeat(MAX_REDIRECT_URI_LENGTH)}`;
    expect(classifyRedirectUri(uri)).toBeNull();
  });
});
