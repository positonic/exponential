/**
 * Redeeming an authorization code (hosted MCP Agent PRD, D8): one-time use,
 * PKCE, the redirect URI and the client must all check out. Prisma is mocked.
 */

import crypto from "crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { redeemAuthorizationCode, verifyPkce } from "../tokenGrant";
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
    connection: { id: "conn-1", clientId: "client-1", disconnectedAt: null },
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

  it("claims the code atomically, so it is used once", async () => {
    await redeem();

    expect(db.oAuthAuthorizationCode.updateMany).toHaveBeenCalledWith({
      where: { id: "code-1", usedAt: null },
      data: { usedAt: expect.any(Date) as unknown },
    });
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
      () => db.oAuthAuthorizationCode.findUnique.mockResolvedValue(codeRow({ connection: { id: "conn-1", clientId: "client-1", disconnectedAt: new Date() } }) as never),
      {},
    ],
  ] as const)("refuses %s with invalid_grant and issues nothing", async (_label, arrange, overrides) => {
    arrange();

    expect(await redeem(overrides)).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(db.oAuthAuthorizationCode.updateMany).not.toHaveBeenCalled();
    expect(db.oAuthToken.create).not.toHaveBeenCalled();
  });
});
