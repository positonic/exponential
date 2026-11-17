/**
 * The connection lock against real Postgres (hosted MCP Agent PRD, D8). Under
 * Read Committed, a revocation that only ran `deleteMany` could finish while a
 * refresh was still inserting its new pair, and that pair would survive. Each
 * test holds a refresh's transaction open at exactly that point and checks
 * the revocation still gets everything.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { getTestDb } from "~/test/test-db";
import { createUser } from "~/test/factories";
import { lockConnection, redeemRefreshToken } from "../tokenGrant";
import { revokeToken } from "../revocation";
import {
  ACCESS_TOKEN_LIFETIME_MS,
  ACCESS_TOKEN_PREFIX,
  generateOAuthSecret,
  REFRESH_TOKEN_LIFETIME_MS,
  REFRESH_TOKEN_PREFIX,
} from "../tokens";

let db: PrismaClient;

beforeEach(() => {
  db = getTestDb();
});

async function seedConnection() {
  const owner = await createUser(db);
  const shadow = await db.user.create({ data: { name: "Race Agent", isAgent: true } });
  const agent = await db.externalAgent.create({ data: { name: "Race Agent", ownerId: owner.id, shadowUserId: shadow.id } });
  const client = await db.oAuthClient.create({
    data: { kind: "registered", name: "Race Client", redirectUris: ["http://127.0.0.1/callback"] },
  });
  const connection = await db.oAuthConnection.create({
    data: {
      ownerId: owner.id,
      clientId: client.id,
      clientKey: "race client|loopback",
      clientName: "Race Client",
      agentId: agent.id,
      resource: "http://localhost:3000/api/mcp",
    },
  });
  return { connectionId: connection.id, clientId: client.id };
}

/** A token row for the connection; returns its secrets. */
async function insertPair(tx: Pick<PrismaClient, "oAuthToken">, connectionId: string, rotated = false) {
  const access = generateOAuthSecret(ACCESS_TOKEN_PREFIX);
  const refresh = generateOAuthSecret(REFRESH_TOKEN_PREFIX);
  const now = Date.now();
  await tx.oAuthToken.create({
    data: {
      connectionId,
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      accessExpiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_MS),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS),
      rotatedAt: rotated ? new Date(now) : null,
    },
  });
  return { access: access.secret, refresh: refresh.secret };
}

/**
 * Open a transaction that does what a refresh does up to its commit (take the
 * lock, insert the new pair), and hold it there until `release` is called.
 */
async function refreshInFlight(connectionId: string) {
  let release!: () => void;
  let held!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const holding = new Promise<void>((resolve) => (held = resolve));
  const committed = db.$transaction(async (tx) => {
    await lockConnection(tx, connectionId);
    await insertPair(tx, connectionId);
    held();
    await released;
  });
  await holding;
  return { release, committed };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("the connection lock (real Postgres)", () => {
  it("a replayed refresh token revokes the pair a concurrent refresh is adding", async () => {
    const { connectionId, clientId } = await seedConnection();
    const stolen = await insertPair(db, connectionId, true);

    const refresh = await refreshInFlight(connectionId);
    const replay = redeemRefreshToken(db, { refreshToken: stolen.refresh, clientId });
    await pause(300); // without the lock the replay would finish here, before the commit
    refresh.release();
    await refresh.committed;

    expect(await replay).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(await db.oAuthToken.count({ where: { connectionId } })).toBe(0);
  });

  it("revoking a token revokes the pair a concurrent refresh is adding", async () => {
    const { connectionId, clientId } = await seedConnection();
    const current = await insertPair(db, connectionId);

    const refresh = await refreshInFlight(connectionId);
    const revocation = revokeToken(db, { token: current.access, clientId });
    await pause(300);
    refresh.release();
    await refresh.committed;

    expect(await revocation).toBe(true);
    expect(await db.oAuthToken.count({ where: { connectionId } })).toBe(0);
  });
});
