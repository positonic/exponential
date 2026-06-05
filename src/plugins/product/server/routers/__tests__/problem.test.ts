/**
 * Unit tests for the `problem` router's product-scoped create/list access.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB. Mirrors
 * the test layout from `action.test.ts` / `document.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Seed env vars before any module imports — `vi.hoisted` runs before regular
// top-level statements. Mirrors action.test.ts.
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

// ── Stub heavy/IO modules pulled in by the wider router tree ─────────
vi.mock("openai", () => ({
  default: class MockOpenAI {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts?: any) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: () => null,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
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

// ── dbMock plumbing ─────────────────────────────────────────────────
const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = {
  current: null,
};
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) {
    dbHolder.current = mockDeep<PrismaClient>();
  }
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

// ── Stub side-effect-heavy modules used by sibling routers ───────────
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";
const productId = "prod-1";

/** Stub the workspace-membership probe that `assertWorkspaceMember` runs. */
function stubMembership(dbMock: DeepMockProxy<PrismaClient>, isMember: boolean) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    isMember
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ role: "member", workspaceId } as any)
      : null,
  );
}

/** Stub the product lookup that `loadProductWithAccess` runs. */
function stubProductLookup(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.product.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: productId, workspaceId, slug: "p" } as any,
  );
}

describe("problem router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("create", () => {
    it("creates a Problem scoped to the product and caller", async () => {
      stubProductLookup(dbMock);
      stubMembership(dbMock, true);
      dbMock.problem.create.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: "problem-1", productId, title: "Onboarding drops off" } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.product.problem.create({
        productId,
        title: "Onboarding drops off",
        impact: 4,
        confidence: 3,
      });

      expect(result.id).toBe("problem-1");
      expect(dbMock.problem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId,
          title: "Onboarding drops off",
          stage: "IDEA",
          impact: 4,
          confidence: 3,
          createdById: callerId,
        }),
      });
    });

    it("rejects when the caller is not a workspace member", async () => {
      stubProductLookup(dbMock);
      stubMembership(dbMock, false);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.product.problem.create({ productId, title: "x" }),
      ).rejects.toThrow(TRPCError);
      expect(dbMock.problem.create).not.toHaveBeenCalled();
    });

    it("rejects when the product does not exist", async () => {
      dbMock.product.findUnique.mockResolvedValue(null);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.product.problem.create({ productId, title: "x" }),
      ).rejects.toThrow(/Product not found/);
      expect(dbMock.problem.create).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("lists Problems filtered by productId (and optional stage)", async () => {
      stubProductLookup(dbMock);
      stubMembership(dbMock, true);
      dbMock.problem.findMany.mockResolvedValue([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: "problem-1", productId, stage: "QUALIFIED" } as any,
      ]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.product.problem.list({
        productId,
        stage: "QUALIFIED",
      });

      expect(result).toHaveLength(1);
      expect(dbMock.problem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId, stage: "QUALIFIED" },
        }),
      );
    });

    it("rejects listing when the caller is not a workspace member", async () => {
      stubProductLookup(dbMock);
      stubMembership(dbMock, false);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.product.problem.list({ productId }),
      ).rejects.toThrow(TRPCError);
      expect(dbMock.problem.findMany).not.toHaveBeenCalled();
    });
  });
});
