/**
 * The two grants at `POST /api/oauth/token` (hosted MCP Agent PRD, D8 and D9).
 *
 * - `authorization_code`: a client redeems a one-time code, proving with its
 *   PKCE verifier that it is the client that started the flow.
 * - `refresh_token`: a client trades its refresh token for a new pair. Every
 *   refresh token is used once: the row it belongs to is marked rotated.
 *
 * Either way the client gets an access token bound to `/api/mcp` plus a
 * refresh token, both opaque and stored only as hashes. Every refusal of the
 * code or refresh token itself is `invalid_grant` (RFC 6749 §5.2): Claude
 * depends on that exact error to restart sign-in.
 */

import crypto from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

import { isClientId } from "./clients";
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

export interface RefreshRedemption {
  refreshToken: string;
  clientId: string;
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

type GrantDb = Pick<PrismaClient, "$transaction" | "oAuthAuthorizationCode" | "oAuthToken">;

/** A fresh access/refresh pair, as secrets (for the client) and hashes (for the row). */
function newPair(now: Date) {
  const access = generateOAuthSecret(ACCESS_TOKEN_PREFIX);
  const refresh = generateOAuthSecret(REFRESH_TOKEN_PREFIX);
  return {
    row: {
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_LIFETIME_MS),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
    },
    response: {
      access_token: access.secret,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000),
      refresh_token: refresh.secret,
      scope: MCP_SCOPE,
    } satisfies TokenResponse,
  };
}

/**
 * Take the connection's row lock for the rest of the transaction. Every write
 * to a connection's tokens takes it first (both grants, replay revocation,
 * `/api/oauth/revoke`, rebinding in `approve`), so they run one at a time per
 * connection. Without it, under Postgres's Read Committed, a revocation could
 * delete the rows it can see while a refresh is inserting a new pair, and
 * the new pair would survive. With it, the revocation waits for the refresh
 * to commit, and its delete, a new statement, sees the new pair.
 */
export async function lockConnection(tx: Prisma.TransactionClient, connectionId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "OAuthConnection" WHERE "id" = ${connectionId} FOR UPDATE`;
}

/** Delete every token of the connection, under its lock. */
export async function revokeConnectionTokens(db: Pick<PrismaClient, "$transaction">, connectionId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockConnection(tx, connectionId);
    await tx.oAuthToken.deleteMany({ where: { connectionId } });
  });
}

/**
 * Housekeeping on every grant, inside its transaction (no cron): drop the
 * connection's rows whose refresh token has expired, and its expired codes.
 */
async function pruneExpired(tx: Prisma.TransactionClient, connectionId: string, now: Date) {
  await tx.oAuthToken.deleteMany({ where: { connectionId, refreshExpiresAt: { lte: now } } });
  await tx.oAuthAuthorizationCode.deleteMany({ where: { connectionId, expiresAt: { lte: now } } });
}

export async function redeemAuthorizationCode(db: GrantDb, redemption: CodeRedemption): Promise<GrantResult> {
  const now = new Date();
  const code = await db.oAuthAuthorizationCode.findUnique({
    where: { codeHash: hashOAuthSecret(redemption.code) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      redirectUri: true,
      codeChallenge: true,
      connection: { select: { id: true, disconnectedAt: true, client: { select: { id: true, metadataUrl: true } } } },
    },
  });
  if (!code) return invalidGrant("The authorization code is not valid.");

  // A code used twice may have been intercepted: revoke whatever the
  // connection holds (RFC 9700 §4.5 / OAuth 2.1 §4.1.3).
  const refuseReuse = async () => {
    await revokeConnectionTokens(db, code.connection.id);
    return invalidGrant("The authorization code has already been used.");
  };
  if (code.usedAt) return refuseReuse();
  if (code.expiresAt <= now) return invalidGrant("The authorization code has expired.");
  if (!isClientId(code.connection.client, redemption.clientId)) {
    return invalidGrant("The authorization code was issued to another client.");
  }
  if (code.redirectUri !== redemption.redirectUri) {
    return invalidGrant("redirect_uri does not match the authorization request.");
  }
  if (!verifyPkce(redemption.codeVerifier, code.codeChallenge)) {
    return invalidGrant("The code_verifier does not match the code_challenge.");
  }
  if (code.connection.disconnectedAt) return invalidGrant("This connection has been disconnected.");

  const pair = newPair(now);
  const issued = await db.$transaction(async (tx) => {
    await lockConnection(tx, code.connection.id);
    // Claim the code atomically: of two concurrent redemptions, one wins.
    const claimed = await tx.oAuthAuthorizationCode.updateMany({
      where: { id: code.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.oAuthToken.create({ data: { connectionId: code.connection.id, ...pair.row } });
    await pruneExpired(tx, code.connection.id, now);
    return true;
  });
  // Losing the claim is reuse too, and the winner may be the interceptor. By
  // now the winner's transaction has committed (it held the connection lock),
  // so its token exists to be revoked.
  if (!issued) return refuseReuse();

  return { ok: true, tokens: pair.response };
}

/**
 * The `refresh_token` grant (D8): in one transaction, mark the presented row
 * rotated, issue a new pair whose refresh token lasts 90 days from now, and
 * prune the connection's expired rows. The rotated row is kept until its own
 * refresh expiry so that presenting its refresh token again is recognised;
 * its access token stays valid until it expires.
 */
export async function redeemRefreshToken(db: GrantDb, redemption: RefreshRedemption): Promise<GrantResult> {
  const now = new Date();
  const row = await db.oAuthToken.findUnique({
    where: { refreshTokenHash: hashOAuthSecret(redemption.refreshToken) },
    select: {
      id: true,
      rotatedAt: true,
      refreshExpiresAt: true,
      connection: { select: { id: true, disconnectedAt: true, client: { select: { id: true, metadataUrl: true } } } },
    },
  });
  if (!row) return invalidGrant("The refresh token is not valid.");

  // A refresh token presented twice was copied: either the client or someone
  // holding a stolen token already used it, and the server can't tell which.
  // Revoke every token of the connection, so both have to sign in again (D8).
  const refuseReplay = async () => {
    await revokeConnectionTokens(db, row.connection.id);
    return invalidGrant("The refresh token has already been used.");
  };
  if (row.rotatedAt) return refuseReplay();
  if (row.refreshExpiresAt <= now) return invalidGrant("The refresh token has expired.");
  if (!isClientId(row.connection.client, redemption.clientId)) {
    return invalidGrant("The refresh token was issued to another client.");
  }
  if (row.connection.disconnectedAt) return invalidGrant("This connection has been disconnected.");

  const pair = newPair(now);
  const issued = await db.$transaction(async (tx) => {
    await lockConnection(tx, row.connection.id);
    // Claim the row atomically: of two concurrent refreshes, one wins.
    const claimed = await tx.oAuthToken.updateMany({
      where: { id: row.id, rotatedAt: null },
      data: { rotatedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.oAuthToken.create({ data: { connectionId: row.connection.id, ...pair.row } });
    await pruneExpired(tx, row.connection.id, now);
    return true;
  });
  // Losing the claim is a replay too. The winner's transaction has committed by
  // now (it held the connection lock), so its new pair is revoked as well.
  if (!issued) return refuseReplay();

  return { ok: true, tokens: pair.response };
}
