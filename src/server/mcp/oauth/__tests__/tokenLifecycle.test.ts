/**
 * The token lifecycle end to end (hosted MCP Agent PRD, D8): the real grants
 * and the real bearer resolver over an in-memory token table, so what the
 * grants write is exactly what `/api/mcp` later reads. A replayed refresh
 * token must leave no access token working, old or new.
 */

import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const fake = vi.hoisted(() => {
  const codes: Row[] = [];
  const tokens: Row[] = [];
  const connection = {
    id: "conn-1",
    disconnectedAt: null,
    client: { id: "client-1", metadataUrl: null },
    resource: "https://app.example.test/api/mcp",
    agent: { shadowUser: { id: "shadow-1", email: null, name: "Agent", image: null } },
  };
  const matches = (row: Row, where: Where) =>
    Object.entries(where).every(([key, value]) =>
      value !== null && typeof value === "object" && "lte" in value
        ? (row[key] as Date) <= (value as { lte: Date }).lte
        : row[key] === value,
    );
  const table = (rows: Row[]) => ({
    updateMany: async ({ where, data }: { where: Where; data: Row }) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const keep = rows.filter((row) => !matches(row, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    },
  });
  const db = {
    codes,
    tokens,
    oAuthAuthorizationCode: {
      ...table(codes),
      findUnique: async ({ where }: { where: Where }) => {
        const row = codes.find((code) => code.codeHash === where.codeHash);
        return row ? { ...row, connection } : null;
      },
    },
    oAuthToken: {
      ...table(tokens),
      findUnique: async ({ where }: { where: Where }) => {
        const row = tokens.find((token) =>
          "accessTokenHash" in where
            ? token.accessTokenHash === where.accessTokenHash
            : token.refreshTokenHash === where.refreshTokenHash,
        );
        return row ? { ...row, connection } : null;
      },
      create: async ({ data }: { data: Row }) => {
        tokens.push({ id: `tok-${tokens.length + 1}`, rotatedAt: null, ...data });
        return {};
      },
    },
    oAuthConnection: { update: async () => ({}) },
    $queryRaw: async () => [],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db;
});

vi.mock("~/server/db", () => ({ db: fake }));

import type { PrismaClient } from "@prisma/client";
import { resolveBearerToken } from "~/server/services/access/bearer";
import { redeemAuthorizationCode, redeemRefreshToken } from "../tokenGrant";
import { hashOAuthSecret } from "../tokens";

const AUDIENCE = "https://app.example.test/api/mcp";
const REDIRECT = "http://127.0.0.1:41234/callback";
const VERIFIER = crypto.randomBytes(32).toString("base64url");
const CODE = "exp_oac_lifecycle";
const grantDb = fake as unknown as PrismaClient;

const works = async (accessToken: string) => (await resolveBearerToken(accessToken, { audience: AUDIENCE })) !== null;
const refresh = (refreshToken: string) => redeemRefreshToken(grantDb, { refreshToken, clientId: "client-1" });

async function signIn() {
  const result = await redeemAuthorizationCode(grantDb, {
    code: CODE,
    clientId: "client-1",
    redirectUri: REDIRECT,
    codeVerifier: VERIFIER,
  });
  if (!result.ok) throw new Error(result.description);
  return result.tokens;
}

beforeEach(() => {
  fake.codes.splice(0);
  fake.tokens.splice(0);
  fake.codes.push({
    id: "code-1",
    connectionId: "conn-1",
    codeHash: hashOAuthSecret(CODE),
    codeChallenge: crypto.createHash("sha256").update(VERIFIER).digest("base64url"),
    redirectUri: REDIRECT,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  });
});

describe("the OAuth token lifecycle", () => {
  it("a refresh returns a working pair and the old refresh token stops working", async () => {
    const first = await signIn();
    const second = await refresh(first.refresh_token);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(await works(second.tokens.access_token)).toBe(true);
    expect(await refresh(second.tokens.refresh_token)).toMatchObject({ ok: true });
  });

  it("after a replay, neither the old nor the new access token works, and nothing can refresh", async () => {
    const first = await signIn();
    const second = await refresh(first.refresh_token);
    if (!second.ok) throw new Error("refresh failed");
    expect(await works(first.access_token)).toBe(true);
    expect(await works(second.tokens.access_token)).toBe(true);

    expect(await refresh(first.refresh_token)).toMatchObject({ ok: false, error: "invalid_grant" });

    expect(await works(first.access_token)).toBe(false);
    expect(await works(second.tokens.access_token)).toBe(false);
    expect(await refresh(second.tokens.refresh_token)).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(fake.tokens).toHaveLength(0);
  });

  it("an expired refresh token is invalid_grant and revokes nothing", async () => {
    const first = await signIn();
    fake.tokens.forEach((row) => (row.refreshExpiresAt = new Date(Date.now() - 1)));

    expect(await refresh(first.refresh_token)).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(await works(first.access_token)).toBe(true);
  });
});
