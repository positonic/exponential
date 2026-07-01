/**
 * Unit tests for the `insight` router's product-scoped access and the general
 * triage fields folded in from the retired `problem` router (ADR-0036).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
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

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
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

vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";
const productId = "prod-1";

function stubMembership(dbMock: DeepMockProxy<PrismaClient>, isMember: boolean) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isMember ? ({ role: "member", workspaceId } as any) : null,
  );
}

function stubProductLookup(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.product.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: productId, workspaceId, slug: "p" } as any,
  );
}

/** Stub the insight lookup that `loadInsightWithAccess` runs. */
function stubInsightLookup(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.insight.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "insight-1", productId, product: { workspaceId } } as any,
  );
}

describe("insight router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    // The create mutation runs inside a $transaction — invoke the callback with
    // the same mock as the transactional client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.$transaction.mockImplementation(async (cb: any) => cb(dbMock));
  });

  describe("create", () => {
    it("creates a PROBLEM insight with the general triage fields", async () => {
      stubProductLookup(dbMock);
      stubMembership(dbMock, true);
      dbMock.insight.create.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: "insight-1", productId, type: "PROBLEM", title: "Onboarding drops off" } as any,
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.product.insight.create({
        productId,
        type: "PROBLEM",
        title: "Onboarding drops off",
        evidence: "5 of 8 interviews mentioned it",
        category: "Onboarding",
        impact: 4,
        confidence: 3,
      });

      expect(result.id).toBe("insight-1");
      expect(dbMock.insight.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId,
          type: "PROBLEM",
          title: "Onboarding drops off",
          evidence: "5 of 8 interviews mentioned it",
          category: "Onboarding",
          impact: 4,
          confidence: 3,
          status: "INBOX",
          createdById: callerId,
        }),
      });
    });

    it("rejects when the caller is not a workspace member", async () => {
      stubProductLookup(dbMock);
      stubMembership(dbMock, false);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.product.insight.create({ productId, type: "PROBLEM", title: "x" }),
      ).rejects.toThrow(TRPCError);
      expect(dbMock.insight.create).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("excludes parked insights by default", async () => {
      stubProductLookup(dbMock);
      stubMembership(dbMock, true);
      dbMock.insight.findMany.mockResolvedValue([]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.insight.list({ productId, category: "Onboarding" });

      expect(dbMock.insight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId, category: "Onboarding", parkedAt: null },
        }),
      );
    });

    it("includes parked insights when includeParked is true", async () => {
      stubProductLookup(dbMock);
      stubMembership(dbMock, true);
      dbMock.insight.findMany.mockResolvedValue([]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.insight.list({ productId, includeParked: true });

      expect(dbMock.insight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId } }),
      );
    });
  });

  describe("park / unpark", () => {
    it("parks an insight with a reason", async () => {
      stubInsightLookup(dbMock);
      stubMembership(dbMock, true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.insight.update.mockResolvedValue({ id: "insight-1" } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.insight.park({ id: "insight-1", reason: "Out of scope" });

      expect(dbMock.insight.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "insight-1" },
          data: expect.objectContaining({ parkReason: "Out of scope" }),
        }),
      );
    });

    it("clears parkedAt and parkReason on unpark", async () => {
      stubInsightLookup(dbMock);
      stubMembership(dbMock, true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.insight.update.mockResolvedValue({ id: "insight-1" } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.insight.unpark({ id: "insight-1" });

      expect(dbMock.insight.update).toHaveBeenCalledWith({
        where: { id: "insight-1" },
        data: { parkedAt: null, parkReason: null },
      });
    });

    it("rejects park when the caller is not a workspace member", async () => {
      stubInsightLookup(dbMock);
      stubMembership(dbMock, false);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.product.insight.park({ id: "insight-1", reason: "x" }),
      ).rejects.toThrow(TRPCError);
      expect(dbMock.insight.update).not.toHaveBeenCalled();
    });
  });
});
