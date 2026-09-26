/**
 * Unit tests for `feature.listForGoal` - the Objective page's Features tab.
 * Alignment only (`Feature.goalId`), scoped to the goal's workspace, with the
 * Key result edges narrowed to this Objective's Key results.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` - no real DB, ever.
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

const workspaceId = "ws-1";

describe("feature.listForGoal", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    dbMock.feature.findMany.mockResolvedValue([]);
  });

  it("lists features aligned to the goal, scoped to its workspace", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.goal.findUnique.mockResolvedValue({ workspaceId } as any);
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "member", workspaceId } as any,
    );

    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    await caller.product.feature.listForGoal({ goalId: 62 });

    const arg = dbMock.feature.findMany.mock.calls[0]![0]!;
    expect(arg.where).toEqual({ goalId: 62, product: { workspaceId } });
    // No status filter: the tab's Deprecated/Archived toggle is client-side.
    expect(JSON.stringify(arg.where)).not.toContain("status");
    const select = arg.select as {
      keyResultLinks?: { where?: unknown };
    };
    expect(select.keyResultLinks?.where).toEqual({
      keyResult: { goalId: 62 },
    });
  });

  it("rejects a caller who is not a workspace member", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.goal.findUnique.mockResolvedValue({ workspaceId } as any);
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);

    const caller = createMockCaller({ userId: "stranger", db: dbMock });
    await expect(
      caller.product.feature.listForGoal({ goalId: 62 }),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(dbMock.feature.findMany).not.toHaveBeenCalled();
  });

  it("returns nothing for a workspace-less goal without querying features", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.goal.findUnique.mockResolvedValue({ workspaceId: null } as any);

    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    await expect(
      caller.product.feature.listForGoal({ goalId: 62 }),
    ).resolves.toEqual([]);
    expect(dbMock.feature.findMany).not.toHaveBeenCalled();
  });

  it("404s an unknown goal", async () => {
    dbMock.goal.findUnique.mockResolvedValue(null);

    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    await expect(
      caller.product.feature.listForGoal({ goalId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
