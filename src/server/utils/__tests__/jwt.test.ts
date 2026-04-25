import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";

import {
  generateJWT,
  CURRENT_SECURITY_VERSION,
  SECURITY_FIX_TIMESTAMP,
  DEFAULT_EXPIRY,
  type JWTUserPayload,
} from "../jwt";

const TEST_SECRET = "test-jwt-secret-for-unit-tests";

const testUser: JWTUserPayload = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  image: "https://example.com/avatar.png",
};

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_SECRET;
});

describe("generateJWT", () => {
  it("generates a valid JWT with correct user claims", () => {
    const token = generateJWT(testUser, { tokenType: "agent-context" });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;

    expect(decoded.userId).toBe("user-123");
    expect(decoded.sub).toBe("user-123");
    expect(decoded.email).toBe("test@example.com");
    expect(decoded.name).toBe("Test User");
    expect(decoded.picture).toBe("https://example.com/avatar.png");
  });

  it("includes securityVersion claim", () => {
    const token = generateJWT(testUser, { tokenType: "agent-context" });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;

    expect(decoded.securityVersion).toBe(CURRENT_SECURITY_VERSION);
  });

  it("includes nbf set to SECURITY_FIX_TIMESTAMP", () => {
    const token = generateJWT(testUser, { tokenType: "agent-context" });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;

    expect(decoded.nbf).toBe(SECURITY_FIX_TIMESTAMP);
  });

  it("uses default expiry for token type", () => {
    const token = generateJWT(testUser, { tokenType: "agent-context" });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;

    const iat = decoded.iat as number;
    const exp = decoded.exp as number;
    expect(exp - iat).toBe(DEFAULT_EXPIRY["agent-context"] * 60);
  });

  it("respects custom expiryMinutes", () => {
    const token = generateJWT(testUser, { tokenType: "api-token", expiryMinutes: 120 });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;

    const iat = decoded.iat as number;
    const exp = decoded.exp as number;
    expect(exp - iat).toBe(120 * 60);
  });

  it("includes tokenName when provided", () => {
    const token = generateJWT(testUser, {
      tokenType: "api-token",
      tokenName: "My Integration Key",
    });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;

    expect(decoded.tokenName).toBe("My Integration Key");
  });

  it("does NOT include tokenName when not provided", () => {
    const token = generateJWT(testUser, { tokenType: "agent-context" });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;

    expect(decoded).not.toHaveProperty("tokenName");
  });

  it("includes standard JWT fields (aud, iss, jti, tokenType)", () => {
    const token = generateJWT(testUser, { tokenType: "whatsapp-gateway" });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;

    expect(decoded.aud).toBe("whatsapp-gateway");
    expect(decoded.iss).toBe("todo-app");
    expect(decoded.jti).toBeDefined();
    expect(decoded.tokenType).toBe("whatsapp-gateway");
  });
});
