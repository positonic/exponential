import crypto from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

import {
  NATIVE_REDIRECT_URI,
  isAllowedRedirectUri,
  isValidCodeChallenge,
  isValidState,
  mintAuthCode,
  signRequestState,
  verifyAuthCode,
  verifyPkce,
  verifyRequestState,
} from "../native-auth";

const TEST_SECRET = "test-jwt-secret-for-unit-tests";

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_SECRET;
});

/** Mirror the app's PKCE: challenge = base64url(sha256(verifier)). */
function challengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

describe("input validation", () => {
  it("accepts a 43-char base64url challenge and rejects others", () => {
    expect(isValidCodeChallenge(challengeFor("a-verifier"))).toBe(true);
    expect(isValidCodeChallenge("")).toBe(false);
    expect(isValidCodeChallenge("too-short")).toBe(false);
    expect(isValidCodeChallenge("/".repeat(43))).toBe(false); // not base64url
    expect(isValidCodeChallenge(null)).toBe(false);
  });

  it("allow-lists exactly the native redirect URI", () => {
    expect(isAllowedRedirectUri(NATIVE_REDIRECT_URI)).toBe(true);
    expect(isAllowedRedirectUri("https://evil.example/callback")).toBe(false);
    expect(isAllowedRedirectUri("exponential://auth/other")).toBe(false);
    expect(isAllowedRedirectUri(null)).toBe(false);
  });

  it("bounds state", () => {
    expect(isValidState("abc")).toBe(true);
    expect(isValidState("")).toBe(false);
    expect(isValidState("x".repeat(513))).toBe(false);
  });
});

describe("verifyPkce", () => {
  it("accepts the matching verifier and rejects a wrong one (constant-time)", () => {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = challengeFor(verifier);
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce("wrong-verifier", challenge)).toBe(false);
  });

  it("rejects a malformed challenge without throwing", () => {
    expect(verifyPkce("v", "!!!not-base64url!!!")).toBe(false);
  });
});

describe("auth code", () => {
  const claims = {
    sub: "user-123",
    codeChallenge: challengeFor("verifier-abc"),
    redirectUri: NATIVE_REDIRECT_URI,
  };

  it("round-trips mint → verify", () => {
    expect(verifyAuthCode(mintAuthCode(claims))).toEqual(claims);
  });

  it("rejects a tampered code", () => {
    const code = mintAuthCode(claims);
    expect(() => verifyAuthCode(code.slice(0, -2) + "xx")).toThrow();
  });

  it("CANNOT be verified with the raw AUTH_SECRET (domain separation)", () => {
    // This is the load-bearing security property: api/trpc.ts verifies Bearer
    // tokens with AUTH_SECRET, so an auth code must NOT pass that check.
    const code = mintAuthCode(claims);
    expect(() => jwt.verify(code, TEST_SECRET)).toThrow();
  });

  it("rejects a foreign JWT that isn't a native auth code", () => {
    const foreign = jwt.sign({ sub: "user-123", purpose: "something-else" }, TEST_SECRET);
    expect(() => verifyAuthCode(foreign)).toThrow();
  });
});

describe("request-state cookie", () => {
  const state = {
    codeChallenge: challengeFor("verifier-xyz"),
    state: "anti-forgery",
    redirectUri: NATIVE_REDIRECT_URI,
  };

  it("round-trips sign → verify", () => {
    const verified = verifyRequestState(signRequestState(state));
    expect(verified).toMatchObject(state);
    expect(verified?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a tampered cookie", () => {
    const cookie = signRequestState(state);
    const [body] = cookie.split(".");
    expect(verifyRequestState(`${body}.deadbeef`)).toBeNull();
  });

  it("rejects an empty/missing cookie", () => {
    expect(verifyRequestState(undefined)).toBeNull();
    expect(verifyRequestState("")).toBeNull();
    expect(verifyRequestState("no-dot")).toBeNull();
  });
});
