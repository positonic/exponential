/**
 * Unit tests for `mastra.mintAgentToken`'s principal gate (ADR-0049 §6; see the
 * rationale on the procedure itself). An agent principal gets FORBIDDEN, and a
 * human still gets a token, which the local-wiki chat path depends on.
 *
 * Mocked Prisma via `createMockCaller`; harness mirrors `mastraCallAgent.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

import jwt from "jsonwebtoken";
import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";

describe("mastra.mintAgentToken — human-only (ADR-0049 §6)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("refuses an exp_agent_ key caller with FORBIDDEN, before any principal lookup", async () => {
    // isAgent: false so only the agent-key fast path can produce the refusal.
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock, tokenType: "agent-key" });

    await expect(caller.mastra.mintAgentToken()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses an agent principal even when it presents another token type", async () => {
    // A person-classified token type, so the token gate passes and only the
    // isAgent principal lookup can produce the refusal (agent-context would be
    // refused by the token gate first, ADR-0070).
    dbMock.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock, tokenType: "api-token" });

    await expect(caller.mastra.mintAgentToken()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.user.findUnique).toHaveBeenCalled();
  });

  it("still mints a short-lived token for a human", async () => {
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });

    const result = await caller.mastra.mintAgentToken();

    expect(result.mastraUrl).toBe(process.env.MASTRA_API_URL);
    expect(result.expiresInMinutes).toBe(30);
    expect(jwt.decode(result.token)).toMatchObject({
      userId: USER_ID,
      tokenType: "agent-context",
    });
  });
});
