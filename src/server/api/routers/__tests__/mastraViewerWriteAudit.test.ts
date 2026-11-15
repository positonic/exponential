/**
 * Viewer write audit, part 2 (ticket sage.blade), the Assistant's side: a
 * viewer cannot write through the `mastra.*` callbacks either. These are what
 * the Assistant and the MCP server call on the user's behalf, so each gap here
 * was the same gap as on the human path, reached by asking for it in chat.
 *
 * - `createProject` checked nothing about the workspace it was given;
 * - `updateProject` asked for view access, `bulkCreateStructure` and
 *   `unlinkProjectFromKeyResult` for bare membership;
 * - the OKR callbacks asked only "do you own the row", which a viewer who
 *   created it still passes.
 *
 * Mocked Prisma, same harness as `viewerWriteAudit.test.ts`.
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
    constructor(_opts?: unknown) {
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

import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const colleagueId = "user-2";
const workspaceId = "ws-1";

type Role = "owner" | "admin" | "member" | "viewer";
type Db = DeepMockProxy<PrismaClient>;
type Caller = ReturnType<typeof createMockCaller>;
interface WriteMock {
  mock: { calls: unknown[] };
}

/**
 * The caller's direct WorkspaceUser role; null for someone outside it. Both
 * lookups are stubbed: the central resolver reads `findUnique`, and
 * `bulkCreateStructure` used to read `findFirst`.
 */
function stubRole(dbMock: Db, role: Role | null) {
  const row = (role ? { role, workspaceId } : null) as never;
  dbMock.workspaceUser.findUnique.mockResolvedValue(row);
  dbMock.workspaceUser.findFirst.mockResolvedValue(row);
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

async function errorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
}

/** Fresh mock, with both `$transaction` forms settling against it. */
function resetDb(): Db {
  const dbMock = getDbMock();
  mockReset(dbMock);
  dbMock.$transaction.mockImplementation(((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(dbMock)
      : Promise.all(arg as Promise<unknown>[])) as never);
  return dbMock;
}

function roleGateCases(opts: {
  arrange: (db: Db) => void;
  act: (caller: Caller) => Promise<unknown>;
  write: (db: Db) => WriteMock;
  outsider?: "FORBIDDEN" | "NOT_FOUND";
}) {
  let dbMock: Db;

  beforeEach(() => {
    dbMock = resetDb();
    opts.arrange(dbMock);
  });

  it("refuses a viewer with FORBIDDEN and writes nothing", async () => {
    stubRole(dbMock, "viewer");
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(await errorCode(opts.act(caller))).toBe("FORBIDDEN");
    expect(opts.write(dbMock).mock.calls).toHaveLength(0);
  });

  it("lets a member through to the write", async () => {
    stubRole(dbMock, "member");
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await opts.act(caller);
    expect(opts.write(dbMock).mock.calls).toHaveLength(1);
  });

  const outsiderCode = opts.outsider;
  if (outsiderCode) {
    it(`refuses someone outside the workspace with ${outsiderCode} and writes nothing`, async () => {
      stubRole(dbMock, null);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      expect(await errorCode(opts.act(caller))).toBe(outsiderCode);
      expect(opts.write(dbMock).mock.calls).toHaveLength(0);
    });
  }
}

const PROJECT = {
  id: "project-1",
  name: "Roadmap",
  description: null,
  status: "ACTIVE",
  priority: "MEDIUM",
  slug: "roadmap",
  startDate: null,
  endDate: null,
  createdById: colleagueId,
  teamId: null,
  workspaceId,
  isPublic: false,
  isRestricted: false,
};

function stubProject(db: Db, over: Partial<typeof PROJECT> = {}) {
  db.project.findUnique.mockResolvedValue({ ...PROJECT, ...over } as never);
  db.projectMember.findFirst.mockResolvedValue(null as never);
  db.project.update.mockResolvedValue({ ...PROJECT, ...over } as never);
}

const goalOf = (ownerId: string) => ({
  id: 7,
  title: "Grow revenue",
  description: null,
  period: "Q4-2026",
  userId: ownerId,
  driUserId: null,
  workspaceId,
  parentGoalId: null,
  parentGoal: null,
  lifeDomain: null,
  projects: [],
});

const keyResultOf = (ownerId: string) => ({
  id: "kr-1",
  title: "Reach 500 customers",
  userId: ownerId,
  workspaceId,
  goalId: 7,
  status: "not-started",
  confidence: null,
  unit: "count",
  period: "Q4-2026",
  startValue: 0,
  currentValue: 0,
  targetValue: 100,
  goal: { id: 7, title: "Grow revenue" },
});

function stubGoal(db: Db, ownerId: string) {
  const goal = goalOf(ownerId);
  db.goal.findUnique.mockResolvedValue(goal as never);
  db.goal.findFirst.mockResolvedValue(goal as never);
  db.goal.create.mockResolvedValue(goal as never);
  db.goal.update.mockResolvedValue(goal as never);
  db.goal.delete.mockResolvedValue(goal as never);
}

function stubKeyResult(db: Db, ownerId: string) {
  const keyResult = keyResultOf(ownerId);
  db.keyResult.findFirst.mockResolvedValue(keyResult as never);
  db.keyResult.create.mockResolvedValue(keyResult as never);
  db.keyResult.update.mockResolvedValue(keyResult as never);
  db.keyResult.delete.mockResolvedValue(keyResult as never);
  db.keyResult.deleteMany.mockResolvedValue({ count: 0 } as never);
}

// ── Projects ──────────────────────────────────────────────────────────

describe("mastra.createProject role gate (mocked)", () => {
  const arrange = (db: Db) => {
    db.project.findFirst.mockResolvedValue(null);
    db.project.create.mockResolvedValue(PROJECT as never);
  };

  roleGateCases({
    arrange,
    act: (caller) => caller.mastra.createProject({ name: "Roadmap", workspaceId }),
    write: (db) => db.project.create,
    // It checked nothing, so anyone who knew the workspace id could write.
    outsider: "FORBIDDEN",
  });

  it("still creates a project with no workspace, without a membership lookup", async () => {
    const dbMock = resetDb();
    arrange(dbMock);

    await createMockCaller({ userId: callerId, db: dbMock }).mastra.createProject({ name: "Roadmap" });

    expect(dbMock.project.create.mock.calls[0]?.[0].data).toMatchObject({ workspaceId: null, createdById: callerId });
    expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
  });
});

describe("mastra.updateProject role gate (mocked)", () => {
  const act = (caller: Caller) => caller.mastra.updateProject({ projectId: PROJECT.id, name: "Renamed" });

  roleGateCases({
    arrange: (db) => stubProject(db),
    act,
    write: (db) => db.project.update,
  });

  it("refuses an outsider on a public project, which view access let through", async () => {
    const dbMock = resetDb();
    stubProject(dbMock, { isPublic: true });
    stubRole(dbMock, null);

    expect(await errorCode(act(createMockCaller({ userId: callerId, db: dbMock })))).toBe("FORBIDDEN");
    expect(dbMock.project.update).not.toHaveBeenCalled();
  });
});

describe("mastra.bulkCreateStructure role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => stubGoal(db, callerId),
    act: (caller) =>
      caller.mastra.bulkCreateStructure({ workspaceId, goals: [{ title: "Grow revenue" }] }),
    write: (db) => db.goal.create,
    outsider: "FORBIDDEN",
  });
});

// ── Goals and key results ─────────────────────────────────────────────

describe("mastra.createOkrObjective role gate (mocked)", () => {
  // A viewer was already stopped here, but by an untyped error that reached
  // the Assistant as INTERNAL_SERVER_ERROR. It is a FORBIDDEN now.
  roleGateCases({
    arrange: (db) => stubGoal(db, callerId),
    act: (caller) => caller.mastra.createOkrObjective({ title: "Grow revenue", workspaceId }),
    write: (db) => db.goal.create,
    outsider: "FORBIDDEN",
  });
});

describe("mastra.unlinkProjectFromKeyResult role gate (mocked)", () => {
  // A colleague's key result: "owner or any member" let a viewer unlink.
  roleGateCases({
    arrange: (db) => {
      stubKeyResult(db, colleagueId);
      db.keyResultProject.deleteMany.mockResolvedValue({ count: 1 } as never);
    },
    act: (caller) =>
      caller.mastra.unlinkProjectFromKeyResult({ keyResultId: "kr-1", projectId: PROJECT.id }),
    write: (db) => db.keyResultProject.deleteMany,
    outsider: "NOT_FOUND",
  });
});

describe("the Assistant's goal tools on a colleague's goal (mocked)", () => {
  // Both go through goalService, whose write paths used the read gate.
  describe("mastra.setObjectiveParent", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, colleagueId),
      act: (caller) => caller.mastra.setObjectiveParent({ goalId: 7, parentGoalId: null }),
      write: (db) => db.goal.update,
    });
  });

  describe("mastra.addGoalUpdate", () => {
    roleGateCases({
      arrange: (db) => {
        stubGoal(db, colleagueId);
        db.goalUpdate.create.mockResolvedValue({ id: "update-1" } as never);
      },
      act: (caller) => caller.mastra.addGoalUpdate({ goalId: 7, content: "Slipping", health: "at-risk" }),
      write: (db) => db.goalUpdate.create,
    });
  });
});

describe("the Assistant's OKR tools for a viewer who owns the row (mocked)", () => {
  describe("mastra.updateOkrObjective", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, callerId),
      act: (caller) => caller.mastra.updateOkrObjective({ id: 7, title: "Renamed" }),
      write: (db) => db.goal.update,
    });
  });

  describe("mastra.deleteOkrObjective", () => {
    roleGateCases({
      arrange: (db) => {
        stubGoal(db, callerId);
        db.keyResult.deleteMany.mockResolvedValue({ count: 0 } as never);
      },
      act: (caller) => caller.mastra.deleteOkrObjective({ id: 7 }),
      write: (db) => db.goal.delete,
    });
  });

  describe("mastra.linkProjectToGoal", () => {
    roleGateCases({
      arrange: (db) => {
        stubGoal(db, callerId);
        db.project.findFirst.mockResolvedValue({ ...PROJECT, createdById: callerId } as never);
      },
      act: (caller) => caller.mastra.linkProjectToGoal({ goalId: 7, projectId: PROJECT.id }),
      write: (db) => db.goal.update,
    });
  });

  describe("mastra.unlinkProjectFromGoal", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, callerId),
      act: (caller) => caller.mastra.unlinkProjectFromGoal({ goalId: 7, projectId: PROJECT.id }),
      write: (db) => db.goal.update,
    });
  });

  describe("mastra.createOkrKeyResult", () => {
    roleGateCases({
      arrange: (db) => {
        stubGoal(db, callerId);
        stubKeyResult(db, callerId);
      },
      act: (caller) =>
        caller.mastra.createOkrKeyResult({ goalId: 7, title: "Reach 500 customers", targetValue: 500, period: "Q4-2026" }),
      write: (db) => db.keyResult.create,
    });
  });

  describe("mastra.updateOkrKeyResult", () => {
    roleGateCases({
      arrange: (db) => stubKeyResult(db, callerId),
      act: (caller) => caller.mastra.updateOkrKeyResult({ id: "kr-1", title: "Renamed" }),
      write: (db) => db.keyResult.update,
    });
  });

  describe("mastra.deleteOkrKeyResult", () => {
    roleGateCases({
      arrange: (db) => stubKeyResult(db, callerId),
      act: (caller) => caller.mastra.deleteOkrKeyResult({ id: "kr-1" }),
      write: (db) => db.keyResult.delete,
    });
  });

  describe("mastra.checkInOkrKeyResult", () => {
    roleGateCases({
      arrange: (db) => {
        stubKeyResult(db, callerId);
        db.keyResultCheckIn.create.mockResolvedValue({
          id: "checkin-1",
          previousValue: 0,
          newValue: 30,
          notes: null,
          createdAt: new Date("2026-11-15T10:00:00Z"),
        } as never);
      },
      act: (caller) => caller.mastra.checkInOkrKeyResult({ keyResultId: "kr-1", newValue: 30 }),
      write: (db) => db.keyResultCheckIn.create,
    });
  });
});

describe("mastra.createOkrKeyResult workspace (mocked)", () => {
  it("files the key result in its objective's workspace, not the one the tool forwards", async () => {
    const dbMock = resetDb();
    stubGoal(dbMock, callerId);
    stubKeyResult(dbMock, callerId);
    stubRole(dbMock, "member");

    await createMockCaller({ userId: callerId, db: dbMock }).mastra.createOkrKeyResult({
      goalId: 7,
      title: "Reach 500 customers",
      targetValue: 500,
      period: "Q4-2026",
      // The chat's workspace, which the caller need not belong to.
      workspaceId: "ws-somewhere-else",
    });

    expect(dbMock.keyResult.create.mock.calls[0]?.[0].data).toMatchObject({ workspaceId });
  });

  it("keeps a key result on a personal objective personal", async () => {
    const dbMock = resetDb();
    dbMock.goal.findFirst.mockResolvedValue({ ...goalOf(callerId), workspaceId: null } as never);
    stubKeyResult(dbMock, callerId);

    await createMockCaller({ userId: callerId, db: dbMock }).mastra.createOkrKeyResult({
      goalId: 7,
      title: "Reach 500 customers",
      targetValue: 500,
      period: "Q4-2026",
      workspaceId: "ws-somewhere-else",
    });

    expect(dbMock.keyResult.create.mock.calls[0]?.[0].data).toMatchObject({ workspaceId: null });
    expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
  });
});
