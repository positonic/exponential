/**
 * Unit tests for the `ticket` router's `list` Area filter.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB. Mirrors
 * the test layout from `problem.test.ts` / `action.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Seed env vars before any module imports — `vi.hoisted` runs before regular
// top-level statements. Mirrors problem.test.ts.
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
const areaTagId = "tag-clear-api";

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

/** Grab the `where` clause from the single ticket.findMany call. */
function findManyWhere(dbMock: DeepMockProxy<PrismaClient>) {
  const call = dbMock.ticket.findMany.mock.calls[0]?.[0];
  return call?.where;
}

describe("ticket router — list Area filter (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubProductLookup(dbMock);
    stubMembership(dbMock, true);
    // depsOut must be present (array) — the procedure maps over it.
    dbMock.ticket.findMany.mockResolvedValue([]);
  });

  it("adds a tags.some constraint when areaTagId is supplied", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket.list({ productId, areaTagId });

    expect(findManyWhere(dbMock)).toMatchObject({
      productId,
      tags: { some: { tagId: areaTagId } },
    });
  });

  it("is a no-op when areaTagId is omitted (no tags constraint)", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket.list({ productId });

    const where = findManyWhere(dbMock);
    expect(where).toMatchObject({ productId });
    expect(where).not.toHaveProperty("tags");
  });

  it("composes the Area filter with status / type / featureId / epicId / cycleId", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket.list({
      productId,
      areaTagId,
      status: "IN_PROGRESS",
      type: "BUG",
      featureId: "feat-1",
      epicId: "epic-1",
      cycleId: "cycle-1",
    });

    expect(findManyWhere(dbMock)).toMatchObject({
      productId,
      status: "IN_PROGRESS",
      type: "BUG",
      featureId: "feat-1",
      epicId: "epic-1",
      cycleId: "cycle-1",
      tags: { some: { tagId: areaTagId } },
    });
  });

  it("only returns tickets carrying the Area tag (filtering is delegated to Prisma)", async () => {
    // The router passes the constraint to Prisma; with the mock returning the
    // matching ticket we assert the result flows through and is shaped (no depsOut).
    dbMock.ticket.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "t1", productId, status: "TODO", depsOut: [] } as any,
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.product.ticket.list({ productId, areaTagId });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "t1", openBlockerCount: 0, isBlocked: false });
    expect(result[0]).not.toHaveProperty("depsOut");
    expect(findManyWhere(dbMock)).toMatchObject({ tags: { some: { tagId: areaTagId } } });
  });
});
