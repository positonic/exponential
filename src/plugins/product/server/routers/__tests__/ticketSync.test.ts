/**
 * Unit tests for the `ticketSync` router's soft-disconnect semantics
 * (ADR-0042): disconnect flips state only — TicketSync links and
 * TicketSyncRun history survive — and saveConfig revives the same
 * [productId, provider] row on reconnect.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB. Mirrors
 * the test layout from `ticket.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Seed env vars before any module imports — `vi.hoisted` runs before regular
// top-level statements. Mirrors ticket.test.ts.
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
function stubMembership(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { role: "member", workspaceId } as any,
  );
}

/** Stub the product lookup that `loadProductWithAccess` runs. */
function stubProductLookup(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.product.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: productId, workspaceId, slug: "p" } as any,
  );
}

describe("ticketSync router — soft disconnect (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubProductLookup(dbMock);
    stubMembership(dbMock);
  });

  it("disconnect nulls the integration link instead of deleting the row", async () => {
    dbMock.ticketSyncConfig.update.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cfg-1", integrationId: null } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.product.ticketSync.disconnect({ productId });

    expect(result).toEqual({ ok: true });
    expect(dbMock.ticketSyncConfig.update).toHaveBeenCalledWith({
      where: { productId_provider: { productId, provider: "notion" } },
      data: { integrationId: null },
    });
  });

  it("disconnect never deletes the config, its links, or its run history", async () => {
    dbMock.ticketSyncConfig.update.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cfg-1", integrationId: null } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticketSync.disconnect({ productId });

    expect(dbMock.ticketSyncConfig.delete).not.toHaveBeenCalled();
    expect(dbMock.ticketSyncConfig.deleteMany).not.toHaveBeenCalled();
    expect(dbMock.ticketSync.delete).not.toHaveBeenCalled();
    expect(dbMock.ticketSync.deleteMany).not.toHaveBeenCalled();
    expect(dbMock.ticketSyncRun.delete).not.toHaveBeenCalled();
    expect(dbMock.ticketSyncRun.deleteMany).not.toHaveBeenCalled();
  });

  it("getConfig surfaces the disconnected state (null integration fields)", async () => {
    dbMock.ticketSyncConfig.findUnique.mockResolvedValue({
      id: "cfg-1",
      productId,
      provider: "notion",
      integrationId: null,
      integration: null,
      databaseId: "db-1",
      databaseName: "Backlog",
      enabled: true,
      pushEnabled: false,
      statusMap: null,
      lastPulledAt: null,
      _count: { syncs: 3 },
      createdAt: new Date(),
      updatedAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const config = await caller.product.ticketSync.getConfig({ productId });

    expect(config).toMatchObject({
      integrationId: null,
      integrationName: null,
      integrationStatus: null,
      databaseName: "Backlog",
      linkedTicketCount: 3,
    });
  });

  it("saveConfig revives the existing [productId, provider] row on reconnect", async () => {
    dbMock.integration.findFirst.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "int-2" } as any,
    );
    dbMock.ticketSyncConfig.upsert.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cfg-1", integrationId: "int-2" } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticketSync.saveConfig({
      productId,
      integrationId: "int-2",
      databaseId: "db-other",
      databaseName: "Other backlog",
    });

    // Upsert keyed on [productId, provider] is what makes reconnect revive
    // the disconnected row (history attached) instead of creating a second
    // config — even when a different database is linked.
    expect(dbMock.ticketSyncConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_provider: { productId, provider: "notion" } },
        update: {
          integrationId: "int-2",
          databaseId: "db-other",
          databaseName: "Other backlog",
        },
      }),
    );
    expect(dbMock.ticketSyncConfig.delete).not.toHaveBeenCalled();
  });

  it("listRuns returns the persisted history newest-first with the triggering user", async () => {
    dbMock.ticketSyncConfig.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cfg-1" } as any,
    );
    dbMock.ticketSyncRun.findMany.mockResolvedValue([]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticketSync.listRuns({ productId, limit: 20 });

    expect(dbMock.ticketSyncRun.findMany).toHaveBeenCalledWith({
      where: { configId: "cfg-1" },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: {
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    });
  });

  it("listRuns returns [] when the product has no sync config", async () => {
    dbMock.ticketSyncConfig.findUnique.mockResolvedValue(null);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const runs = await caller.product.ticketSync.listRuns({ productId });

    expect(runs).toEqual([]);
    expect(dbMock.ticketSyncRun.findMany).not.toHaveBeenCalled();
  });

  it("syncNow refuses to run on a disconnected connection", async () => {
    dbMock.ticketSyncConfig.findUnique.mockResolvedValue({
      id: "cfg-1",
      integrationId: null,
      propertyNames: null,
      enabled: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.ticketSync.syncNow({ productId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
