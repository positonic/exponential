/**
 * The authorization-code grant at `POST /api/oauth/token` (hosted MCP Agent
 * PRD, D8 and D9): a client redeems a one-time code, proving with its PKCE
 * verifier that it is the client that started the flow, and gets an access
 * token bound to `/api/mcp` plus a refresh token. Both are opaque and stored
 * only as hashes.
 *
 * Every refusal of the code itself is `invalid_grant` (RFC 6749 §5.2), so a
 * caller learns nothing about which check failed.
 */

import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";

import { MCP_SCOPE } from "./metadata";
import {
  ACCESS_TOKEN_LIFETIME_MS,
  ACCESS_TOKEN_PREFIX,
  generateOAuthSecret,
  hashOAuthSecret,
  REFRESH_TOKEN_LIFETIME_MS,
  REFRESH_TOKEN_PREFIX,
} from "./tokens";

export interface CodeRedemption {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

/** RFC 6749 §5.1 token response. */
export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type GrantResult =
  | { ok: true; tokens: TokenResponse }
  | { ok: false; error: "invalid_grant"; description: string };

/** RFC 7636 §4.1: a verifier is 43 to 128 unreserved characters. */
const CODE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

/** Whether `verifier` hashes to `challenge` under S256 (RFC 7636 §4.6). */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!CODE_VERIFIER.test(verifier)) return false;
  const computed = Buffer.from(crypto.createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
}

const invalidGrant = (description: string): GrantResult => ({ ok: false, error: "invalid_grant", description });

export async function redeemAuthorizationCode(
  db: Pick<PrismaClient, "$transaction" | "oAuthAuthorizationCode" | "oAuthToken">,
  redemption: CodeRedemption,
): Promise<GrantResult> {
  const now = new Date();
  const code = await db.oAuthAuthorizationCode.findUnique({
    where: { codeHash: hashOAuthSecret(redemption.code) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      redirectUri: true,
      codeChallenge: true,
      connection: { select: { id: true, clientId: true, disconnectedAt: true } },
    },
  });
  if (!code) return invalidGrant("The authorization code is not valid.");

  // A code used twice may have been intercepted: revoke whatever the
  // connection holds (RFC 9700 §4.5 / OAuth 2.1 §4.1.3).
  const refuseReuse = async () => {
    await db.oAuthToken.deleteMany({ where: { connectionId: code.connection.id } });
    return invalidGrant("The authorization code has already been used.");
  };
  if (code.usedAt) return refuseReuse();
  if (code.expiresAt <= now) return invalidGrant("The authorization code has expired.");
  if (code.connection.clientId !== redemption.clientId) {
    return invalidGrant("The authorization code was issued to another client.");
  }
  if (code.redirectUri !== redemption.redirectUri) {
    return invalidGrant("redirect_uri does not match the authorization request.");
  }
  if (!verifyPkce(redemption.codeVerifier, code.codeChallenge)) {
    return invalidGrant("The code_verifier does not match the code_challenge.");
  }
  if (code.connection.disconnectedAt) return invalidGrant("This connection has been disconnected.");

  const access = generateOAuthSecret(ACCESS_TOKEN_PREFIX);
  const refresh = generateOAuthSecret(REFRESH_TOKEN_PREFIX);

  const issued = await db.$transaction(async (tx) => {
    // Claim the code atomically: of two concurrent redemptions, one wins.
    const claimed = await tx.oAuthAuthorizationCode.updateMany({
      where: { id: code.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.oAuthToken.create({
      data: {
        connectionId: code.connection.id,
        accessTokenHash: access.hash,
        refreshTokenHash: refresh.hash,
        accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_LIFETIME_MS),
        refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
      },
    });
    return true;
  });
  // Losing the claim is reuse too, and the winner may be the interceptor. By
  // now the winner's transaction has committed (the claim waits on its row
  // lock), so its token exists to be revoked.
  if (!issued) return refuseReuse();

  return {
    ok: true,
    tokens: {
      access_token: access.secret,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000),
      refresh_token: refresh.secret,
      scope: MCP_SCOPE,
    },
  };
}
