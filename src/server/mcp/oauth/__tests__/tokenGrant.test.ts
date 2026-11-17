/**
 * Redeeming an authorization code (hosted MCP Agent PRD, D8): one-time use,
 * PKCE, the redirect URI and the client must all check out. Prisma is mocked.
 */

import crypto from "crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { redeemAuthorizationCode, redeemRefreshToken, verifyPkce } from "../tokenGrant";
import { hashOAuthSecret } from "../tokens";

const VERIFIER = crypto.randomBytes(32).toString("base64url");
const CHALLENGE = crypto.createHash("sha256").update(VERIFIER).digest("base64url");
const CODE = "exp_oac_test-code";
const REDIRECT = "http://127.0.0.1:41234/callback";

let db: DeepMockProxy<PrismaClient>;

function codeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "code-1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    connection: { id: "conn-1", disconnectedAt: null, client: { id: "client-1", metadataUrl: null } },
    ...overrides,
  };
}

const redeem = (overrides: Partial<Parameters<typeof redeemAuthorizationCode>[1]> = {}) =>
  redeemAuthorizationCode(db, { code: CODE, clientId: "client-1", redirectUri: REDIRECT, codeVerifier: VERIFIER, ...overrides });

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  db.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow() as never);
  db.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation((fn: unknown) => (fn as (tx: typeof db) => Promise<unknown>)(db));
});

describe("verifyPkce", () => {
  it("accepts the verifier whose S256 hash is the challenge", () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
  });

  it.each([
    ["another verifier", crypto.randomBytes(32).toString("base64url")],
    ["a verifier too short to be one", "short"],
    ["the challenge itself (plain)", CHALLENGE],
  ])("refuses %s", (_label, verifier) => {
    expect(verifyPkce(verifier, CHALLENGE)).toBe(false);
  });
});

describe("redeemAuthorizationCode", () => {
  it("issues an access token and a refresh token, storing only their hashes", async () => {
    const result = await redeem();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp" });
    expect(result.tokens.access_token).toMatch(/^exp_oat_[A-Za-z0-9_-]{43}$/);
    expect(result.tokens.refresh_token).toMatch(/^exp_ort_[A-Za-z0-9_-]{43}$/);

    expect(db.oAuthAuthorizationCode.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codeHash: hashOAuthSecret(CODE) } }),
    );
    const stored = db.oAuthToken.create.mock.calls[0]?.[0].data;
    expect(stored).toMatchObject({
      connectionId: "conn-1",
      accessTokenHash: hashOAuthSecret(result.tokens.access_token),
      refreshTokenHash: hashOAuthSecret(result.tokens.refresh_token),
    });
    expect(JSON.stringify(stored)).not.toContain(result.tokens.access_token);
    const now = Date.now();
    const accessExpiresAt = (stored?.accessExpiresAt as Date).getTime();
    const refreshExpiresAt = (stored?.refreshExpiresAt as Date).getTime();
    expect(accessExpiresAt - now).toBeGreaterThan(59 * 60 * 1000);
    expect(accessExpiresAt - now).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(refreshExpiresAt - now).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
  });

  it("prunes the connection's expired tokens and codes in the same transaction", async () => {
    await redeem();

    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({
      where: { connectionId: "conn-1", refreshExpiresAt: { lte: expect.any(Date) as unknown } },
    });
    expect(db.oAuthAuthorizationCode.deleteMany).toHaveBeenCalledWith({
      where: { connectionId: "conn-1", expiresAt: { lte: expect.any(Date) as unknown } },
    });
  });

  it("takes the connection's lock before claiming the code or writing a token", async () => {
    await redeem();

    expect(db.$queryRaw.mock.calls[0]?.slice(1)).toEqual(["conn-1"]);
    const lockedAt = db.$queryRaw.mock.invocationCallOrder[0] ?? Infinity;
    expect(lockedAt).toBeLessThan(db.oAuthAuthorizationCode.updateMany.mock.invocationCallOrder[0] ?? 0);
    expect(lockedAt).toBeLessThan(db.oAuthToken.create.mock.invocationCallOrder[0] ?? 0);
  });

  it("claims the code atomically, so it is used once", async () => {
    await redeem();

    expect(db.oAuthAuthorizationCode.updateMany).toHaveBeenCalledWith({
      where: { id: "code-1", usedAt: null },
      data: { usedAt: expect.any(Date) as unknown },
    });
  });

  it("accepts a metadata client by the document URL it uses as client_id", async () => {
    const url = "https://claude.ai/oauth/claude-code-client-metadata";
    db.oAuthAuthorizationCode.findUnique.mockResolvedValue(
      codeRow({ connection: { id: "conn-1", disconnectedAt: null, client: { id: "cuid-1", metadataUrl: url } } }) as never,
    );

    expect(await redeem({ clientId: url })).toMatchObject({ ok: true });
    expect(await redeem({ clientId: "https://claude.ai/oauth/someone-else" })).toMatchObject({ ok: false, error: "invalid_grant" });
  });

  it("refuses a reused code and revokes the connection's tokens", async () => {
    db.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow({ usedAt: new Date() }) as never);

    expect(await redeem()).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { connectionId: "conn-1" } });
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
  });

  it("refuses the loser of two concurrent redemptions and revokes the winner's tokens", async () => {
    db.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 0 });

    expect(await redeem()).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { connectionId: "conn-1" } });
  });

  it.each([
    ["an unknown code", () => db.oAuthAuthorizationCode.findUnique.mockResolvedValue(null), {}],
    ["an expired code", () => db.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow({ expiresAt: new Date(Date.now() - 1) }) as never), {}],
    ["a wrong verifier", () => undefined, { codeVerifier: crypto.randomBytes(32).toString("base64url") }],
    ["another redirect URI", () => undefined, { redirectUri: "http://127.0.0.1:41235/callback" }],
    ["another client", () => undefined, { clientId: "client-2" }],
    [
      "a disconnected connection",
      () => db.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow({ connection: { id: "conn-1", disconnectedAt: new Date(), client: { id: "client-1", metadataUrl: null } } }) as never),
      {},
    ],
  ] as const)("refuses %s with invalid_grant and issues nothing", async (_label, arrange, overrides) => {
    arrange();

    expect(await redeem(overrides)).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(db.oAuthAuthorizationCode.updateMany).not.toHaveBeenCalled();
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
  });
});

describe("redeemRefreshToken", () => {
  const REFRESH = "exp_ort_old-refresh";

  function tokenRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "tok-1",
      rotatedAt: null,
      refreshExpiresAt: new Date(Date.now() + 60_000),
      connection: { id: "conn-1", disconnectedAt: null, client: { id: "client-1", metadataUrl: null } },
      ...overrides,
    };
  }

  const refresh = (overrides: Partial<Parameters<typeof redeemRefreshToken>[1]> = {}) =>
    redeemRefreshToken(db, { refreshToken: REFRESH, clientId: "client-1", ...overrides });

  beforeEach(() => {
    db.oAuthToken.findUnique.mockResolvedValue(tokenRow() as never);
    db.oAuthToken.updateMany.mockResolvedValue({ count: 1 });
  });

  it("marks the presented row rotated and issues a new pair, refresh lasting 90 days from now", async () => {
    const result = await refresh();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp" });
    expect(result.tokens.refresh_token).not.toBe(REFRESH);

    expect(db.oAuthToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { refreshTokenHash: hashOAuthSecret(REFRESH) } }),
    );
    expect(db.oAuthToken.updateMany).toHaveBeenCalledWith({
      where: { id: "tok-1", rotatedAt: null },
      data: { rotatedAt: expect.any(Date) as unknown },
    });
    const stored = db.oAuthToken.create.mock.calls[0]?.[0].data;
    expect(stored).toMatchObject({
      connectionId: "conn-1",
      accessTokenHash: hashOAuthSecret(result.tokens.access_token),
      refreshTokenHash: hashOAuthSecret(result.tokens.refresh_token),
    });
    const refreshExpiresAt = (stored?.refreshExpiresAt as Date).getTime();
    expect(refreshExpiresAt - Date.now()).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
  });

  it("prunes the connection's rows whose refresh token has expired, in the same transaction", async () => {
    await refresh();

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({
      where: { connectionId: "conn-1", refreshExpiresAt: { lte: expect.any(Date) as unknown } },
    });
  });

  it("treats a replayed refresh token as stolen: every token of the connection goes, under its lock", async () => {
    db.oAuthToken.findUnique.mockResolvedValue(tokenRow({ rotatedAt: new Date() }) as never);

    expect(await refresh()).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { connectionId: "conn-1" } });
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.oAuthToken.deleteMany.mock.invocationCallOrder[0] ?? 0);
  });

  it("takes the connection's lock before rotating the row", async () => {
    await refresh();

    expect(db.$queryRaw.mock.calls[0]?.slice(1)).toEqual(["conn-1"]);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.oAuthToken.updateMany.mock.invocationCallOrder[0] ?? 0);
  });

  it("revokes the connection when it loses a concurrent refresh, the winner's new pair included", async () => {
    db.oAuthToken.updateMany.mockResolvedValue({ count: 0 });

    expect(await refresh()).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { connectionId: "conn-1" } });
  });

  it.each([
    ["an unknown refresh token", () => db.oAuthToken.findUnique.mockResolvedValue(null), {}],
    ["an expired refresh token", () => db.oAuthToken.findUnique.mockResolvedValue(tokenRow({ refreshExpiresAt: new Date(Date.now() - 1) }) as never), {}],
    ["another client", () => undefined, { clientId: "client-2" }],
    [
      "a disconnected connection",
      () => db.oAuthToken.findUnique.mockResolvedValue(tokenRow({ connection: { id: "conn-1", disconnectedAt: new Date(), client: { id: "client-1", metadataUrl: null } } }) as never),
      {},
    ],
  ] as const)("refuses %s with invalid_grant and issues nothing", async (_label, arrange, overrides) => {
    arrange();

    expect(await refresh(overrides)).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(db.oAuthToken.updateMany).not.toHaveBeenCalled();
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
    expect(db.oAuthToken.deleteMany).not.toHaveBeenCalled();
  });
});
