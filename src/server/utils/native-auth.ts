import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * Server half of the native iOS/Mac sign-in handshake (ADR 0005 in the
 * `exponential-ios` repo). Flow:
 *
 *   1. The app opens `/api/auth/native/start?code_challenge&state&redirect_uri`
 *      in `ASWebAuthenticationSession`. The user logs in via any NextAuth
 *      provider (or is already logged in — Safari cookie SSO).
 *   2. `start` mints a short-lived **auth code** (a signed JWT, below) bound to
 *      the userId + PKCE `code_challenge`, and 302s back to
 *      `exponential://auth/callback?code&state`.
 *   3. The app POSTs `{code, code_verifier}` to `auth.exchangeAuthCode`, which
 *      verifies the code + PKCE and mints the durable **device-token** pair.
 *
 * SECURITY — domain-separated signing keys. The auth code and the cross-bounce
 * request cookie are each signed with a key *derived from* `AUTH_SECRET` but
 * distinct from it. This is deliberate: `api/trpc.ts` accepts any
 * `AUTH_SECRET`-signed JWT as an `Authorization: Bearer` credential. If the auth
 * code were signed with the raw `AUTH_SECRET`, an intercepted code could be
 * replayed directly as an API token. With a derived key it cannot — it fails
 * `jwt.verify(code, AUTH_SECRET)` outright.
 */

/** The only redirect target we will ever emit (matches the app's locked CFBundleURLTypes scheme). */
export const NATIVE_REDIRECT_URI = "exponential://auth/callback";

/** Signed, httpOnly cookie carrying the PKCE request across the NextAuth login bounce. */
export const NATIVE_AUTH_REQUEST_COOKIE = "native_auth_req";

/** Auth code lifetime. Deliberately tiny — it's a single-hop bearer, redeemed immediately. */
const AUTH_CODE_TTL_SECONDS = 60;

/** Request-cookie lifetime — long enough to complete an OAuth provider round-trip. */
export const REQUEST_COOKIE_TTL_SECONDS = 600;

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required for native auth");
  }
  return secret;
}

/** Key for the auth-code JWT — domain-separated from `AUTH_SECRET` (see module note). */
function codeSecret(): string {
  return crypto.createHmac("sha256", authSecret()).update("native-auth-code-v1").digest("hex");
}

/** Key for the request-state cookie HMAC — also domain-separated. */
function cookieKey(): Buffer {
  return crypto.createHmac("sha256", authSecret()).update("native-auth-cookie-v1").digest();
}

// ---------------------------------------------------------------------------
// base64url helpers (no padding) — matches the app's PKCE encoding.
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64urlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

// ---------------------------------------------------------------------------
// Input validation (called on the untrusted query string in `start`).
// ---------------------------------------------------------------------------

/** A PKCE S256 challenge is base64url(sha256(...)) → exactly 43 chars, no padding. */
export function isValidCodeChallenge(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Anti-forgery `state` — opaque, just bound it so it can't be abused as a payload. */
export function isValidState(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

/** Exact-match allow-list — never reflect an arbitrary redirect_uri (open-redirect / code exfiltration). */
export function isAllowedRedirectUri(value: string | null | undefined): value is string {
  return value === NATIVE_REDIRECT_URI;
}

// ---------------------------------------------------------------------------
// Auth code (signed JWT, stateless — no DB row).
// ---------------------------------------------------------------------------

export interface AuthCodeClaims {
  /** The authenticated user the code was minted for. */
  sub: string;
  /** PKCE S256 challenge the redeeming device must prove the verifier for. */
  codeChallenge: string;
  /** Echoed back so exchange can re-assert the locked redirect target. */
  redirectUri: string;
}

export function mintAuthCode(claims: AuthCodeClaims): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: claims.sub,
      codeChallenge: claims.codeChallenge,
      redirectUri: claims.redirectUri,
      purpose: "native_auth_code",
      iat: now,
      exp: now + AUTH_CODE_TTL_SECONDS,
      jti: crypto.randomUUID(),
    },
    codeSecret(),
  );
}

/** Verify + decode an auth code. Throws on bad signature, expiry, or wrong purpose. */
export function verifyAuthCode(code: string): AuthCodeClaims {
  const decoded = jwt.verify(code, codeSecret()) as Record<string, unknown>;
  if (decoded.purpose !== "native_auth_code") {
    throw new Error("Token is not a native auth code");
  }
  const { sub, codeChallenge, redirectUri } = decoded;
  if (typeof sub !== "string" || typeof codeChallenge !== "string" || typeof redirectUri !== "string") {
    throw new Error("Malformed native auth code");
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new Error("Auth code carries a disallowed redirect_uri");
  }
  return { sub, codeChallenge, redirectUri };
}

/**
 * PKCE S256 check: does `sha256(code_verifier)` equal the `code_challenge`?
 * Constant-time on the raw 32-byte digests.
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = crypto.createHash("sha256").update(codeVerifier).digest();
  let expected: Buffer;
  try {
    expected = base64urlToBuffer(codeChallenge);
  } catch {
    return false;
  }
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

// ---------------------------------------------------------------------------
// Cross-bounce request cookie (HMAC-signed JSON; integrity, not secrecy).
// ---------------------------------------------------------------------------

export interface RequestState {
  codeChallenge: string;
  state: string;
  redirectUri: string;
  /** Absolute epoch-seconds expiry. */
  exp: number;
}

export function signRequestState(state: Omit<RequestState, "exp">): string {
  const payload: RequestState = { ...state, exp: Math.floor(Date.now() / 1000) + REQUEST_COOKIE_TTL_SECONDS };
  const body = base64url(JSON.stringify(payload));
  const mac = base64url(crypto.createHmac("sha256", cookieKey()).update(body).digest());
  return `${body}.${mac}`;
}

export function verifyRequestState(cookieValue: string | undefined | null): RequestState | null {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return null;
  const body = cookieValue.slice(0, dot);
  const mac = cookieValue.slice(dot + 1);

  const expected = base64url(crypto.createHmac("sha256", cookieKey()).update(body).digest());
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length || !crypto.timingSafeEqual(macBuf, expBuf)) {
    return null;
  }

  let payload: RequestState;
  try {
    payload = JSON.parse(base64urlToBuffer(body).toString("utf8")) as RequestState;
  } catch {
    return null;
  }
  if (
    typeof payload.exp !== "number" ||
    payload.exp < Math.floor(Date.now() / 1000) ||
    !isValidCodeChallenge(payload.codeChallenge) ||
    !isValidState(payload.state) ||
    !isAllowedRedirectUri(payload.redirectUri)
  ) {
    return null;
  }
  return payload;
}
