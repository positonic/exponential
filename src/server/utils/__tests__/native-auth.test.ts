import crypto from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

import {
  ALLOWED_REDIRECT_URIS,
  NATIVE_REDIRECT_URI,
  TAURI_REDIRECT_URI,
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

  it("allow-lists both shell schemes and nothing else", () => {
    expect(isAllowedRedirectUri(NATIVE_REDIRECT_URI)).toBe(true);
    expect(isAllowedRedirectUri(TAURI_REDIRECT_URI)).toBe(true);
    expect(isAllowedRedirectUri("https://evil.example/callback")).toBe(false);
    expect(isAllowedRedirectUri("exponential://auth/other")).toBe(false);
    expect(isAllowedRedirectUri("exponential-beta://auth/other")).toBe(false);
    // Near-misses on the new scheme: no prefix/suffix slack in the match.
    expect(isAllowedRedirectUri("exponential-beta://auth/callback/")).toBe(false);
    expect(isAllowedRedirectUri("exponential-beta-evil://auth/callback")).toBe(false);
    expect(isAllowedRedirectUri(null)).toBe(false);
    expect(isAllowedRedirectUri(undefined)).toBe(false);
  });

  it("pins the two schemes so a rename can't silently break a shipped shell", () => {
    // iOS/Electron read these from the ADR-0005 contract; the values are frozen.
    expect(NATIVE_REDIRECT_URI).toBe("exponential://auth/callback");
    expect(TAURI_REDIRECT_URI).toBe("exponential-beta://auth/callback");
    expect(ALLOWED_REDIRECT_URIS).toEqual([NATIVE_REDIRECT_URI, TAURI_REDIRECT_URI]);
  });

  it("keeps the two schemes distinct so macOS can route each shell's callback", () => {
    expect(NATIVE_REDIRECT_URI).not.toBe(TAURI_REDIRECT_URI);
    expect(new URL(NATIVE_REDIRECT_URI).protocol).not.toBe(
      new URL(TAURI_REDIRECT_URI).protocol,
    );
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

  it.each(ALLOWED_REDIRECT_URIS)("binds the issuing scheme into the code (%s)", (redirectUri) => {
    // The shells share this path, so the code must carry *which* scheme it was
    // issued for — that's what the exchange re-asserts.
    expect(verifyAuthCode(mintAuthCode({ ...claims, redirectUri }))).toMatchObject({
      redirectUri,
    });
  });

  it("rejects a well-signed code carrying a redirect_uri off the allow-list", () => {
    // Defence in depth: even if a future caller minted one, redemption refuses it.
    const code = mintAuthCode({ ...claims, redirectUri: "https://evil.example/callback" });
    expect(() => verifyAuthCode(code)).toThrow();
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

  it.each(ALLOWED_REDIRECT_URIS)(
    "carries the scheme across the login bounce (%s)",
    (redirectUri) => {
      // A shell that signs in from cold hits /signin and comes back with only
      // this cookie — lose the scheme here and the callback goes to the wrong app.
      expect(verifyRequestState(signRequestState({ ...state, redirectUri }))).toMatchObject({
        redirectUri,
      });
    },
  );

  it("rejects a validly-signed cookie carrying a redirect_uri off the allow-list", () => {
    const cookie = signRequestState({ ...state, redirectUri: "https://evil.example/callback" });
    expect(verifyRequestState(cookie)).toBeNull();
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
