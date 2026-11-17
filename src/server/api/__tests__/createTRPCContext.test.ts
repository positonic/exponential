/**
 * `createTRPCContext` after the bearer resolver moved out of it (hosted MCP
 * Agent PRD, D5): it must behave as before for a cookie session, an External
 * agent key and a JWT. Real signed JWTs and real-format agent keys; only
 * NextAuth and Prisma are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "create-trpc-context-test-secret";
});

const { auth, db } = vi.hoisted(() => ({
  auth: vi.fn(),
  db: {
    externalAgentKey: { findUnique: vi.fn(), update: vi.fn() },
    oAuthToken: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("~/server/auth", () => ({ auth }));
vi.mock("~/server/db", () => ({ db }));

import { createTRPCContext } from "../trpc";
import { generateJWT } from "~/server/utils/jwt";
import { generateExternalAgentKey } from "~/server/utils/external-agent-keys";

const PERSON = { id: "user-person", email: "person@example.test", name: "Person", image: null, isAdmin: true };
const SHADOW = { id: "user-shadow", email: null, name: "Claude", image: null };

function headersWith(token?: string): Headers {
  return new Headers(token ? { authorization: `Bearer ${token}` } : {});
}

function agentKeyRow(expiresAt: Date | null = null) {
  return { id: "key-1", expiresAt, agent: { shadowUser: SHADOW } };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(null);
  db.externalAgentKey.update.mockResolvedValue({});
  db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === PERSON.id ? PERSON : null),
  );
});

describe("createTRPCContext", () => {
  it("uses the cookie session and ignores any bearer token", async () => {
    auth.mockResolvedValue({ user: { id: PERSON.id }, expires: "x" });
    const ctx = await createTRPCContext({ headers: headersWith(generateExternalAgentKey().secret) });

    expect(ctx.session?.user.id).toBe(PERSON.id);
    expect(ctx.tokenType).toBeUndefined();
    expect(db.externalAgentKey.findUnique).not.toHaveBeenCalled();
  });

  it("resolves an External agent key to its shadow user, never as an admin", async () => {
    db.externalAgentKey.findUnique.mockResolvedValue(agentKeyRow());
    const ctx = await createTRPCContext({ headers: headersWith(generateExternalAgentKey().secret) });

    expect(ctx.session?.user).toMatchObject({ id: SHADOW.id, isAdmin: false });
    expect(ctx.tokenType).toBe("agent-key");
    expect(ctx.agentRunId).toBeUndefined();
    expect(db.externalAgentKey.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "key-1" } }),
    );
  });

  it("refuses an expired agent key", async () => {
    db.externalAgentKey.findUnique.mockResolvedValue(agentKeyRow(new Date(Date.now() - 1000)));
    const ctx = await createTRPCContext({ headers: headersWith(generateExternalAgentKey().secret) });

    expect(ctx.session).toBeNull();
    expect(ctx.tokenType).toBeUndefined();
  });

  it("an unknown agent key is unauthenticated and is never tried as a JWT", async () => {
    db.externalAgentKey.findUnique.mockResolvedValue(null);
    const ctx = await createTRPCContext({ headers: headersWith(generateExternalAgentKey().secret) });

    expect(ctx.session).toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("resolves a person's api-token JWT with its token type", async () => {
    const token = generateJWT(PERSON, { tokenType: "api-token" });
    const ctx = await createTRPCContext({ headers: headersWith(token) });

    expect(ctx.session?.user).toMatchObject({ id: PERSON.id, isAdmin: true });
    expect(ctx.tokenType).toBe("api-token");
    expect(ctx.agentRunId).toBeUndefined();
  });

  it("carries the run of an agent-context JWT", async () => {
    const token = generateJWT(PERSON, { tokenType: "agent-context", extraClaims: { runId: "run-1" } });
    const ctx = await createTRPCContext({ headers: headersWith(token) });

    expect(ctx.tokenType).toBe("agent-context");
    expect(ctx.agentRunId).toBe("run-1");
  });

  it("falls back to no session for a JWT signed with another secret", async () => {
    const token = generateJWT(PERSON, { tokenType: "api-token" });
    process.env.AUTH_SECRET = "a-different-secret";
    try {
      const ctx = await createTRPCContext({ headers: headersWith(token) });
      expect(ctx.session).toBeNull();
      expect(ctx.tokenType).toBeUndefined();
    } finally {
      process.env.AUTH_SECRET = "create-trpc-context-test-secret";
    }
  });

  it("falls back to no session for a JWT naming a user that does not exist", async () => {
    const token = generateJWT({ id: "user-gone" }, { tokenType: "api-token" });
    const ctx = await createTRPCContext({ headers: headersWith(token) });

    expect(ctx.session).toBeNull();
  });

  it("refuses an OAuth access token: its audience is the MCP endpoint, not /api/trpc", async () => {
    const ctx = await createTRPCContext({ headers: headersWith("exp_oat_issued-for-api-mcp") });

    expect(ctx.session).toBeNull();
    // Never looked up, and never tried as a JWT.
    expect(db.oAuthToken.findUnique).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("has no session without a cookie or a bearer token", async () => {
    const ctx = await createTRPCContext({ headers: headersWith() });
    expect(ctx.session).toBeNull();
    expect(ctx.tokenType).toBeUndefined();
  });
});
