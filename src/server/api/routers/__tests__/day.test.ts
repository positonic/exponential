/**
 * Unit tests for the `day` router.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). `Day` rows are shared across users
 * (keyed by date, no userId), so `getByDate` must scope the included notes and
 * exercises to the caller or it leaks every user's journal entries.
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

import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";

describe("day router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("getByDate", () => {
    it("scopes included notes and exercises to the calling user", async () => {
      dbMock.day.findFirst.mockResolvedValue(null as never);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.day.getByDate({ date: new Date("2026-09-16T10:00:00Z") });

      expect(dbMock.day.findFirst).toHaveBeenCalledTimes(1);
      const args = dbMock.day.findFirst.mock.calls[0]![0]!;
      expect(args.include).toEqual({
        notes: { where: { userId: USER_ID } },
        exercises: { where: { userId: USER_ID } },
      });
    });

    it("never includes an unscoped relation", async () => {
      dbMock.day.findFirst.mockResolvedValue(null as never);

      const caller = createMockCaller({ userId: "user-2", db: dbMock });
      await caller.day.getByDate({ date: new Date("2026-09-16T10:00:00Z") });

      const include = dbMock.day.findFirst.mock.calls[0]![0]!.include ?? {};
      for (const [relation, value] of Object.entries(include)) {
        expect(value, `${relation} include must be user-scoped`).toEqual({
          where: { userId: "user-2" },
        });
      }
    });
  });
});
