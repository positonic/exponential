/**
 * Unit tests for the Features V2 registry behavior in the `feature` router:
 * the scope -> feature status rollup, the deprecation cascade, and the
 * never-live archive guard (ADR-0040, CONTEXT.md "Feature" / "Deprecated").
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
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";
const productId = "prod-1";
const featureId = "feature-1";
const scopeId = "scope-1";

function stubMembership(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { role: "member", workspaceId } as any,
  );
}

/** Stub the scope lookup that `loadScopeWithAccess` runs. */
function stubScopeLookup(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.featureScope.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: scopeId, featureId, feature: { productId, product: { workspaceId } } } as any,
  );
}

/**
 * Stub the feature reads: first the `loadFeatureWithAccess` shape, then the
 * rollup read (status + scope statuses). `feature.findUnique` serves both, so
 * the stub answers by the `select` used.
 */
function stubFeatureReads(
  dbMock: DeepMockProxy<PrismaClient>,
  status: string,
  scopeStatuses: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbMock.feature.findUnique.mockImplementation((async (args: any) => {
    if (args?.select?.scopes) {
      return { status, scopes: scopeStatuses.map((s) => ({ status: s })) };
    }
    return {
      id: featureId,
      productId,
      product: { workspaceId },
      status,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
}

describe("feature router registry behavior (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    // $transaction: support both callback form and array form.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === "function" ? arg(dbMock) : Promise.all(arg),
    );
  });

  describe("scope -> feature rollup", () => {
    it("a live scope makes the feature live", async () => {
      stubMembership(dbMock);
      stubScopeLookup(dbMock);
      stubFeatureReads(dbMock, "IN_PROGRESS", ["SHIPPED", "PLANNED"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.featureScope.update.mockResolvedValue({ id: scopeId } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.feature.updateScope({ id: scopeId, status: "SHIPPED" });

      expect(dbMock.feature.updateMany).toHaveBeenCalledWith({
        where: { id: featureId, status: { notIn: ["DEPRECATED", "ARCHIVED"] } },
        data: { status: "SHIPPED" },
      });
    });

    it("going live auto-stamps shippedAt when the caller did not", async () => {
      stubMembership(dbMock);
      stubScopeLookup(dbMock);
      stubFeatureReads(dbMock, "SHIPPED", ["SHIPPED"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.featureScope.update.mockResolvedValue({ id: scopeId } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.feature.updateScope({ id: scopeId, status: "SHIPPED" });

      expect(dbMock.featureScope.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "SHIPPED",
            shippedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("does not derive a status when all scopes are planned", async () => {
      stubMembership(dbMock);
      stubScopeLookup(dbMock);
      stubFeatureReads(dbMock, "DEFINED", ["PLANNED", "PLANNED"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.featureScope.update.mockResolvedValue({ id: scopeId } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.feature.updateScope({ id: scopeId, status: "PLANNED" });

      expect(dbMock.feature.updateMany).not.toHaveBeenCalled();
    });

    it("never derives over a deprecated feature", async () => {
      stubMembership(dbMock);
      stubScopeLookup(dbMock);
      stubFeatureReads(dbMock, "DEPRECATED", ["SHIPPED", "IN_PROGRESS"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.featureScope.update.mockResolvedValue({ id: scopeId } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.feature.updateScope({ id: scopeId, status: "IN_PROGRESS" });

      expect(dbMock.feature.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("deprecation cascade", () => {
    it("deprecates only LIVE scopes, in one transaction with the feature update", async () => {
      stubMembership(dbMock);
      stubFeatureReads(dbMock, "SHIPPED", ["SHIPPED", "PLANNED"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.feature.update.mockResolvedValue({ id: featureId, status: "DEPRECATED" } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.feature.update({
        id: featureId,
        status: "DEPRECATED",
        deprecateScopes: true,
      });

      expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
      expect(dbMock.featureScope.updateMany).toHaveBeenCalledWith({
        where: { featureId, status: "SHIPPED" },
        data: { status: "DEPRECATED" },
      });
      expect(dbMock.feature.update).toHaveBeenCalledWith({
        where: { id: featureId },
        data: expect.objectContaining({ status: "DEPRECATED" }),
      });
    });

    it("does not cascade without the deprecateScopes flag", async () => {
      stubMembership(dbMock);
      stubFeatureReads(dbMock, "SHIPPED", ["SHIPPED"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.feature.update.mockResolvedValue({ id: featureId } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.feature.update({ id: featureId, status: "DEPRECATED" });

      expect(dbMock.featureScope.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("archive guard", () => {
    it("rejects archiving a feature that is live", async () => {
      stubMembership(dbMock);
      stubFeatureReads(dbMock, "SHIPPED", []);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.product.feature.update({ id: featureId, status: "ARCHIVED" }),
      ).rejects.toThrow(TRPCError);
      expect(dbMock.feature.update).not.toHaveBeenCalled();
    });

    it("allows archiving a feature that was never live", async () => {
      stubMembership(dbMock);
      stubFeatureReads(dbMock, "IDEA", []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.feature.update.mockResolvedValue({ id: featureId, status: "ARCHIVED" } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.product.feature.update({ id: featureId, status: "ARCHIVED" });

      expect(dbMock.feature.update).toHaveBeenCalled();
    });
  });
});
