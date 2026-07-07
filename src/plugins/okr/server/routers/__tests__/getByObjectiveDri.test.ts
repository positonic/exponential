/**
 * Regression guard for the "My Goals" (onlyMine) view of the okr router.
 *
 * It must be a strictly DRI-scoped view: an objective/KR the user merely
 * created (its `userId`) must NOT surface — only ones where the user is the DRI
 * (`driUserId`). See the filters in ../keyResult.ts (getByObjective).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
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
const WORKSPACE_ID = "ws-1";

// Recursively collect every `driUserId` / `userId` scalar reference in a where
// clause so we can assert on which ownership fields the query keys off.
function collectFields(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectFields(n, out));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "userId" || key === "driUserId") out.push(key);
      collectFields(value, out);
    }
  }
}

describe("okr.getByObjective — My Goals (onlyMine) DRI scoping", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    // Grant workspace membership so the procedure passes its access check.
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.goal.findMany.mockResolvedValue([]);
  });

  it("filters objectives by DRI (objective or any KR), never by owner", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.okr.getByObjective({
      workspaceId: WORKSPACE_ID,
      period: "Annual-2026",
      includePairedPeriod: false,
      onlyMine: true,
    });

    expect(db.goal.findMany).toHaveBeenCalledTimes(1);
    const arg = db.goal.findMany.mock.calls[0]![0]!;
    const where = arg.where as Record<string, unknown>;

    // The onlyMine ownership clause lives under AND. It must reference driUserId
    // (objective DRI + KR DRI via keyResults.some) and must NOT reference the
    // owner field `userId` — owning an objective is not enough to see it here.
    const ownershipFields: string[] = [];
    collectFields(where.AND, ownershipFields);
    expect(ownershipFields).toContain("driUserId");
    expect(ownershipFields).not.toContain("userId");

    // The objective filter reaches its KRs' DRI via a `keyResults.some` clause.
    const serialized = JSON.stringify(where.AND);
    expect(serialized).toContain("keyResults");
    expect(serialized).toContain("some");

    // The included key results are scoped to the ones the user is DRI for.
    const include = arg.include as { keyResults?: { where?: unknown } };
    const krFields: string[] = [];
    collectFields(include.keyResults?.where, krFields);
    expect(krFields).toContain("driUserId");
    expect(krFields).not.toContain("userId");
  });
});
