/**
 * Unit tests for the workspace-home `yourWork` procedures added for the
 * tiered daily home (currentCycles, waitingOnYou, staleCheckins,
 * sinceYesterday): rollup weighting, the prMerged join, lastCheckIn mapping,
 * and the since-floor clamp.
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

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
}

/** Every procedure under test runs the workspace-membership middleware. */
function stubMembership(db: DeepMockProxy<PrismaClient>) {
  db.workspaceUser.findUnique.mockResolvedValue({
    role: "member",
    workspaceId: WORKSPACE_ID,
  } as never);
}

const product = { slug: "prod", name: "Product", funTicketIds: false };

function ticket(over: {
  id: string;
  status?: string;
  points?: number | null;
  cycleId?: string;
  assigneeId?: string | null;
}) {
  return {
    id: over.id,
    shortId: null,
    number: 1,
    title: `Ticket ${over.id}`,
    status: over.status ?? "COMMITTED",
    points: over.points ?? null,
    cycleId: over.cycleId ?? "cycle-1",
    assigneeId: over.assigneeId ?? null,
    product,
  };
}

let db: DeepMockProxy<PrismaClient>;

beforeEach(() => {
  db = getDbMock();
  mockReset(db);
  stubMembership(db);
});

describe("yourWork.currentCycles", () => {
  it("returns [] without querying tickets when no cycle is current", async () => {
    db.list.findMany.mockResolvedValue([] as never);

    const result = await caller(db).yourWork.currentCycles({
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toEqual([]);
    expect(db.ticket.findMany).not.toHaveBeenCalled();
  });

  it("rolls up by ticket count when no ticket carries points", async () => {
    db.list.findMany.mockResolvedValue([
      {
        id: "cycle-1",
        name: "Cycle 1",
        status: "ACTIVE",
        startDate: null,
        endDate: null,
        cycleGoal: "Ship it",
      },
    ] as never);
    db.ticket.findMany.mockResolvedValue([
      ticket({ id: "a", status: "DONE" }),
      ticket({ id: "b", status: "IN_PROGRESS", assigneeId: USER_ID }),
      ticket({ id: "c", status: "COMMITTED" }),
    ] as never);

    const [cycle] = await caller(db).yourWork.currentCycles({
      workspaceId: WORKSPACE_ID,
    });

    expect(cycle).toMatchObject({
      usesPoints: false,
      committed: 3,
      completed: 1,
      inProgress: 1,
      cycleGoal: "Ship it",
      myOpenCount: 1,
    });
    expect(cycle?.myTickets.map((t) => t.id)).toEqual(["b"]);
  });

  it("weights by points when any ticket has them, and sorts my tickets by workflow order", async () => {
    db.list.findMany.mockResolvedValue([
      {
        id: "cycle-1",
        name: "Cycle 1",
        status: "ACTIVE",
        startDate: null,
        endDate: null,
        cycleGoal: null,
      },
    ] as never);
    db.ticket.findMany.mockResolvedValue([
      ticket({ id: "done", status: "DONE", points: 3, assigneeId: USER_ID }),
      ticket({ id: "wip", status: "IN_PROGRESS", points: 2, assigneeId: USER_ID }),
      // Pointless ticket contributes 0 weight once usesPoints is on.
      ticket({ id: "zero", status: "COMMITTED", points: null }),
    ] as never);

    const [cycle] = await caller(db).yourWork.currentCycles({
      workspaceId: WORKSPACE_ID,
    });

    expect(cycle).toMatchObject({
      usesPoints: true,
      committed: 5,
      completed: 3,
      inProgress: 2,
    });
    // IN_PROGRESS (order 4) ranks before DONE (order 7).
    expect(cycle?.myTickets.map((t) => t.id)).toEqual(["wip", "done"]);
    // The DONE ticket is mine but not open.
    expect(cycle?.myOpenCount).toBe(1);
  });

  it("scopes each cycle's rollup to its own tickets", async () => {
    db.list.findMany.mockResolvedValue([
      { id: "cycle-1", name: "A", status: "ACTIVE", startDate: null, endDate: null, cycleGoal: null },
      { id: "cycle-2", name: "B", status: "ACTIVE", startDate: null, endDate: null, cycleGoal: null },
    ] as never);
    db.ticket.findMany.mockResolvedValue([
      ticket({ id: "a1", cycleId: "cycle-1", status: "DONE" }),
      ticket({ id: "b1", cycleId: "cycle-2" }),
      ticket({ id: "b2", cycleId: "cycle-2" }),
    ] as never);

    const cycles = await caller(db).yourWork.currentCycles({
      workspaceId: WORKSPACE_ID,
    });

    expect(cycles.map((c) => c.committed)).toEqual([1, 2]);
    expect(cycles.map((c) => c.completed)).toEqual([1, 0]);
  });
});

describe("yourWork.waitingOnYou", () => {
  it("flags prMerged only for tickets whose PR has a merged webhook row", async () => {
    db.ticket.findMany.mockResolvedValue([
      { ...ticket({ id: "merged" }), prUrl: "https://github.com/x/y/pull/1", updatedAt: new Date() },
      { ...ticket({ id: "open" }), prUrl: "https://github.com/x/y/pull/2", updatedAt: new Date() },
      { ...ticket({ id: "nopr" }), prUrl: null, updatedAt: new Date() },
    ] as never);
    db.gitHubActivity.findMany.mockResolvedValue([
      { prUrl: "https://github.com/x/y/pull/1" },
    ] as never);

    const result = await caller(db).yourWork.waitingOnYou({
      workspaceId: WORKSPACE_ID,
    });

    expect(result.map((t) => [t.id, t.prMerged])).toEqual([
      ["merged", true],
      ["open", false],
      ["nopr", false],
    ]);
  });

  it("skips the GitHubActivity query when no ticket has a PR", async () => {
    db.ticket.findMany.mockResolvedValue([
      { ...ticket({ id: "nopr" }), prUrl: null, updatedAt: new Date() },
    ] as never);

    const result = await caller(db).yourWork.waitingOnYou({
      workspaceId: WORKSPACE_ID,
    });

    expect(result[0]?.prMerged).toBe(false);
    expect(db.gitHubActivity.findMany).not.toHaveBeenCalled();
  });
});

describe("yourWork.staleCheckins", () => {
  it("maps the latest check-in to lastCheckIn, null when never checked in", async () => {
    const lastWeek = new Date("2026-08-01T10:00:00Z");
    db.keyResult.findMany.mockResolvedValue([
      {
        id: 1,
        title: "KR with history",
        goalId: 10,
        status: "on-track",
        statusOverride: null,
        checkIns: [{ createdAt: lastWeek }],
      },
      {
        id: 2,
        title: "Fresh KR",
        goalId: 10,
        status: "at-risk",
        statusOverride: null,
        checkIns: [],
      },
    ] as never);

    const result = await caller(db).yourWork.staleCheckins({
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toEqual([
      expect.objectContaining({ id: 1, lastCheckIn: lastWeek }),
      expect.objectContaining({ id: 2, lastCheckIn: null }),
    ]);
    // The raw checkIns array must not leak through.
    expect(result[0]).not.toHaveProperty("checkIns");
  });
});

describe("yourWork.sinceYesterday", () => {
  it("flattens groupBy counts and excludes the caller's own events", async () => {
    db.workspaceActivityEvent.groupBy.mockResolvedValue([
      { entityType: "ticket", action: "status_changed", _count: { _all: 4 } },
      { entityType: "goal", action: "created", _count: { _all: 1 } },
    ] as never);

    const result = await caller(db).yourWork.sinceYesterday({
      workspaceId: WORKSPACE_ID,
      since: new Date(),
    });

    expect(result).toEqual([
      { entityType: "ticket", action: "status_changed", count: 4 },
      { entityType: "goal", action: "created", count: 1 },
    ]);

    const args = db.workspaceActivityEvent.groupBy.mock.calls[0]?.[0] as {
      where: { OR: unknown[]; entityType: { notIn: string[] } };
    };
    expect(args.where.entityType.notIn).toContain("ticket_sync_run");
    expect(args.where.OR).toEqual([
      { userId: null },
      { userId: { not: USER_ID } },
    ]);
  });

  it("clamps `since` to at most 7 days back", async () => {
    db.workspaceActivityEvent.groupBy.mockResolvedValue([] as never);

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await caller(db).yourWork.sinceYesterday({
      workspaceId: WORKSPACE_ID,
      since: monthAgo,
    });

    const args = db.workspaceActivityEvent.groupBy.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date } };
    };
    const floorMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(args.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(
      floorMs - 60_000,
    );
  });
});
