import { describe, it, expect } from "vitest";
import {
  EXTERNAL_AGENT_KEY_PREFIX,
  generateExternalAgentKey,
  hashExternalAgentKey,
  isExternalAgentKey,
} from "../external-agent-keys";

describe("generateExternalAgentKey", () => {
  it("produces a prefixed, high-entropy secret", () => {
    const { secret } = generateExternalAgentKey();
    expect(secret.startsWith(EXTERNAL_AGENT_KEY_PREFIX)).toBe(true);
    // 32 random bytes base64url ≈ 43 chars after the prefix
    expect(secret.length).toBeGreaterThanOrEqual(EXTERNAL_AGENT_KEY_PREFIX.length + 40);
  });

  it("never generates the same secret twice", () => {
    const a = generateExternalAgentKey();
    const b = generateExternalAgentKey();
    expect(a.secret).not.toBe(b.secret);
    expect(a.hash).not.toBe(b.hash);
  });

  it("returns the SHA-256 of the secret as the stored hash", () => {
    const { secret, hash } = generateExternalAgentKey();
    expect(hash).toBe(hashExternalAgentKey(secret));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // The secret itself must never equal what we store.
    expect(hash).not.toContain(secret);
  });

  it("returns a display prefix that leaks only the key's head", () => {
    const { secret, displayPrefix } = generateExternalAgentKey();
    expect(displayPrefix.endsWith("…")).toBe(true);
    const shown = displayPrefix.slice(0, -1);
    expect(secret.startsWith(shown)).toBe(true);
    // Head only: prefix + 6 chars, far too short to reconstruct 32 bytes.
    expect(shown.length).toBe(EXTERNAL_AGENT_KEY_PREFIX.length + 6);
  });
});

describe("isExternalAgentKey", () => {
  it("recognizes generated keys", () => {
    expect(isExternalAgentKey(generateExternalAgentKey().secret)).toBe(true);
  });

  it("rejects JWTs and arbitrary bearer tokens", () => {
    expect(isExternalAgentKey("eyJhbGciOiJIUzI1NiJ9.e30.sig")).toBe(false);
    expect(isExternalAgentKey("")).toBe(false);
    expect(isExternalAgentKey("exp_agent")).toBe(false); // missing trailing underscore
  });
});
