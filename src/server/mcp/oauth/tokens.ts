/**
 * The OAuth secrets for MCP clients (hosted MCP Agent PRD, D8): authorization
 * codes, access tokens and refresh tokens. Each is generated the way an
 * External agent key is (32 random bytes, base64url, ADR-0049): high-entropy
 * and opaque, so only its SHA-256 is stored and lookup is an indexed equality.
 * Each has its own prefix so secret scanners and log redaction can tell them
 * apart, and none is a JWT, so revoking one takes effect on the next request.
 */

import crypto from "crypto";

export const AUTHORIZATION_CODE_PREFIX = "exp_oac_";
export const ACCESS_TOKEN_PREFIX = "exp_oat_";
export const REFRESH_TOKEN_PREFIX = "exp_ort_";

type OAuthSecretPrefix = typeof AUTHORIZATION_CODE_PREFIX | typeof ACCESS_TOKEN_PREFIX | typeof REFRESH_TOKEN_PREFIX;

/** An authorization code is redeemable for five minutes. */
export const AUTHORIZATION_CODE_LIFETIME_MS = 5 * 60 * 1000;
/** An access token lasts an hour (Agent PRD, open question 2). */
export const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
/** A refresh token lasts 90 days from its last use. */
export const REFRESH_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

export interface OAuthSecret {
  /** The secret itself: handed to the client once, never stored. */
  secret: string;
  /** SHA-256 hex of the secret: the only thing persisted. */
  hash: string;
}

export function generateOAuthSecret(prefix: OAuthSecretPrefix): OAuthSecret {
  const secret = `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
  return { secret, hash: hashOAuthSecret(secret) };
}

export function hashOAuthSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Cheap syntactic test so the bearer resolver can branch before any DB work. */
export function isOAuthAccessToken(bearerToken: string): boolean {
  return bearerToken.startsWith(ACCESS_TOKEN_PREFIX);
}
