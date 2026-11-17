/**
 * Token revocation (RFC 7009) for MCP clients (hosted MCP Agent PRD, D9). A
 * client that signs out sends its access or refresh token; revoking either
 * one of a pair deletes every token of the connection, so the client has to
 * sign in again. The connection itself and its agent stay.
 *
 * Holding the token is the proof: an unknown token, or one presented with
 * another client's `client_id`, revokes nothing and still gets 200, so the
 * endpoint tells a caller nothing about which tokens exist (RFC 7009 §2.2).
 */

import type { PrismaClient } from "@prisma/client";

import { isClientId } from "./clients";
import { revokeConnectionTokens } from "./tokenGrant";
import { ACCESS_TOKEN_PREFIX, hashOAuthSecret, REFRESH_TOKEN_PREFIX } from "./tokens";

export interface Revocation {
  token: string;
  /** Optional for a public client; when sent, it must be the client the token was issued to. */
  clientId: string | null;
}

/** Revoke the pair `token` belongs to; returns whether anything was revoked. */
export async function revokeToken(
  db: Pick<PrismaClient, "$transaction" | "oAuthToken">,
  revocation: Revocation,
): Promise<boolean> {
  const hash = hashOAuthSecret(revocation.token);
  // The prefix says which kind it is, whatever `token_type_hint` claims.
  const where = revocation.token.startsWith(ACCESS_TOKEN_PREFIX)
    ? { accessTokenHash: hash }
    : revocation.token.startsWith(REFRESH_TOKEN_PREFIX)
      ? { refreshTokenHash: hash }
      : null;
  if (!where) return false;

  const row = await db.oAuthToken.findUnique({
    where,
    select: { connection: { select: { id: true, client: { select: { id: true, metadataUrl: true } } } } },
  });
  if (!row) return false;
  if (revocation.clientId !== null && !isClientId(row.connection.client, revocation.clientId)) return false;

  await revokeConnectionTokens(db, row.connection.id);
  return true;
}
