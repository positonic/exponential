/**
 * The Goals page lists one set of objectives whichever view renders it, so
 * `goal.getAllMyGoals` (Table) and `okr.getByObjective` (OKRs / Timeline)
 * must build their `where` from the same `objectiveScopeWhere` rule, and
 * `okr.getStats` (the period header) must scope its key results the same
 * way. Mocked Prisma only — see CLAUDE.md "Test database safety".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { objectiveScopeWhere } from "../../objectiveScope";

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

function goalWhere(db: DeepMockProxy<PrismaClient>): Record<string, unknown> {
  expect(db.goal.findMany).toHaveBeenCalledTimes(1);
  return db.goal.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
}

describe("objective scope — goal.getAllMyGoals", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.goal.findMany.mockResolvedValue([]);
  });

  it("a quarter scopes by own period or a key result in it, hiding archived", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.goal.getAllMyGoals({ workspaceId: WORKSPACE_ID, period: "Q4-2026" });
    const where = goalWhere(db);
    expect(where.workspaceId).toBe(WORKSPACE_ID);
    expect(where).toMatchObject(
      objectiveScopeWhere({ period: "Q4-2026", onlyMine: false, userId: USER_ID }),
    );
  });

  it("All (period null) has no period clause but still hides archived", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.goal.getAllMyGoals({ workspaceId: WORKSPACE_ID, period: null });
    const where = goalWhere(db);
    expect(where.status).toEqual({ not: "archived" });
    expect(where.AND).toBeUndefined();
    expect(JSON.stringify(where)).not.toContain("period");
  });

  it("Mine adds the DRI rule and an explicit status still wins", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.goal.getAllMyGoals({
      workspaceId: WORKSPACE_ID,
      period: "Q4-2026",
      onlyMine: true,
      status: "completed",
    });
    const where = goalWhere(db);
    expect(where.status).toBe("completed");
    expect(where.AND).toEqual(
      objectiveScopeWhere({ period: "Q4-2026", onlyMine: true, userId: USER_ID }).AND,
    );
  });

  it("outside a workspace, Mine is ignored (the list is already the caller's)", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.goal.getAllMyGoals({ onlyMine: true });
    const where = goalWhere(db);
    expect(where.userId).toBe(USER_ID);
    expect(where.AND).toBeUndefined();
  });
});

describe("objective scope — okr.getByObjective", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.goal.findMany.mockResolvedValue([]);
  });

  it("builds the same where as getAllMyGoals for the same period", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.okr.getByObjective({
      workspaceId: WORKSPACE_ID,
      period: "Q4-2026",
      includePairedPeriod: false,
    });
    const where = goalWhere(db);
    expect(where).toMatchObject(
      objectiveScopeWhere({ period: "Q4-2026", onlyMine: false, userId: USER_ID }),
    );
    // No more "period: null" leak: a period-less objective is not in a quarter.
    expect(JSON.stringify(where)).not.toContain('"period":null');
  });

  it("pairing a quarter with its year matches either period", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.okr.getByObjective({
      workspaceId: WORKSPACE_ID,
      period: "Q1-2026",
      includePairedPeriod: true,
    });
    const where = goalWhere(db);
    expect(where.AND).toEqual(
      objectiveScopeWhere({
        period: ["Q1-2026", "Annual-2026"],
        onlyMine: false,
        userId: USER_ID,
      }).AND,
    );
  });

  it("no period means every non-archived objective", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.okr.getByObjective({ workspaceId: WORKSPACE_ID });
    const where = goalWhere(db);
    expect(where.status).toEqual({ not: "archived" });
    expect(where.AND).toBeUndefined();
  });

  it("a goalId read bypasses the scope rule entirely", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.okr.getByObjective({ workspaceId: WORKSPACE_ID, goalId: 7, period: "Q1-2026" });
    const where = goalWhere(db);
    expect(where.id).toBe(7);
    expect(where.status).toBeUndefined();
  });
});

describe("objective scope — okr.getStats", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.keyResult.count.mockResolvedValue(0);
    db.goal.count.mockResolvedValue(0);
    db.keyResult.findMany.mockResolvedValue([]);
  });

  function krWhere(): Record<string, unknown> {
    return db.keyResult.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
  }

  it("a period counts that period's key results, archived objectives aside", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.okr.getStats({ workspaceId: WORKSPACE_ID, period: "Q4-2026" });
    expect(krWhere()).toEqual({
      workspaceId: WORKSPACE_ID,
      period: "Q4-2026",
      goal: { status: { not: "archived" } },
    });
  });

  it("All narrates the selected year: every key result whose period ends in it", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    const result = await caller.okr.getStats({
      workspaceId: WORKSPACE_ID,
      period: null,
      year: "2026",
    });
    expect(krWhere()).toMatchObject({ period: { endsWith: "-2026" } });
    expect(result.periodEndDate).toBeNull();
  });

  it("Mine keeps the key results the caller is the DRI on", async () => {
    const caller = createMockCaller({ userId: USER_ID, db });
    await caller.okr.getStats({ workspaceId: WORKSPACE_ID, period: "Q4-2026", onlyMine: true });
    expect(krWhere()).toMatchObject({ driUserId: USER_ID });
    expect(JSON.stringify(krWhere())).not.toContain('"userId"');
  });
});
