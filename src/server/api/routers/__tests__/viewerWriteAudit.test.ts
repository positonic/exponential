/**
 * Viewer write audit, part 2 (ticket sage.blade): the write paths a workspace
 * `viewer` could still use after the first pass. A viewer is a free seat on
 * the Team plan, so each of these was a billing hole as well as an access one.
 *
 * Three shapes of gap are covered:
 *
 * - no check on the workspace at all (`project.create`, a meeting filed
 *   straight into a workspace), which also admitted someone outside it;
 * - a check for view access or bare membership in front of a write;
 * - ownership standing in for a role (goals, key results), so a viewer who
 *   created the row, or was made its DRI, could still change it.
 *
 * Each block checks that a viewer gets FORBIDDEN and nothing is written, and
 * that a member still goes through to the write. Mocked Prisma, same harness
 * as `viewListWriteRole.test.ts`.
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

// Embedding, ceremony auto-attach and the calendar cancel are side effects
// with their own suites; here they only mark that the write was reached.
const { embedTranscriptionMock, cancelScheduledMeetingMock } = vi.hoisted(() => ({
  embedTranscriptionMock: vi.fn(),
  cancelScheduledMeetingMock: vi.fn(),
}));
vi.mock("~/server/services/KnowledgeService", () => ({
  KnowledgeService: class MockKnowledgeService {},
  getKnowledgeService: vi.fn(() => ({
    embedTranscription: embedTranscriptionMock,
    search: vi.fn(),
  })),
}));
vi.mock("~/server/services/ceremonies/autoAttach", () => ({
  attachMeetingToOccurrence: vi.fn().mockResolvedValue({ match: null }),
}));
vi.mock("~/server/services/calendar/cancelScheduledMeeting", () => ({
  cancelScheduledMeeting: cancelScheduledMeetingMock,
}));

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

/** The caller's direct WorkspaceUser role; null for someone outside it. */
function stubRole(dbMock: Db, role: Role | null) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    (role ? { role, workspaceId } : null) as never,
  );
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

/**
 * Shared shape for every block: `arrange` stubs the entity lookup and the
 * write; `act` fires the mutation; `write` is the mock that must stay
 * untouched for a viewer and be hit for a member. `outsider` adds the case of
 * someone who is not in the workspace at all, with the code they get.
 */
function roleGateCases(opts: {
  arrange: (db: Db) => void;
  act: (caller: Caller) => Promise<unknown>;
  write: (db: Db) => WriteMock;
  outsider?: "FORBIDDEN" | "NOT_FOUND";
}) {
  let dbMock: Db;

  beforeEach(() => {
    dbMock = resetDb();
    embedTranscriptionMock.mockReset().mockResolvedValue(3);
    cancelScheduledMeetingMock.mockReset().mockResolvedValue({ cancelled: true });
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

/** A project in the workspace that the caller neither created nor is a member of. */
const PROJECT = {
  id: "project-1",
  name: "Roadmap",
  createdById: colleagueId,
  teamId: null,
  workspaceId,
  isPublic: false,
  isRestricted: false,
};

function stubProject(db: Db, over: Partial<typeof PROJECT> = {}) {
  db.project.findUnique.mockResolvedValue({ ...PROJECT, ...over } as never);
  db.projectMember.findFirst.mockResolvedValue(null as never);
}

const goalOf = (ownerId: string) => ({
  id: 7,
  title: "Grow revenue",
  status: "planned",
  userId: ownerId,
  driUserId: null,
  workspaceId,
  parentGoalId: null,
});

const keyResultOf = (ownerId: string) => ({
  id: "kr-1",
  title: "Reach 500 customers",
  userId: ownerId,
  workspaceId,
  goalId: 7,
  status: "not-started",
  startValue: 0,
  currentValue: 0,
  targetValue: 100,
});

function stubGoal(db: Db, ownerId: string) {
  const goal = goalOf(ownerId);
  db.goal.findUnique.mockResolvedValue(goal as never);
  db.goal.findFirst.mockResolvedValue(goal as never);
  db.goal.findUniqueOrThrow.mockResolvedValue(goal as never);
  db.goal.create.mockResolvedValue(goal as never);
  db.goal.update.mockResolvedValue(goal as never);
  db.goal.delete.mockResolvedValue(goal as never);
}

function stubKeyResult(db: Db, ownerId: string) {
  const keyResult = keyResultOf(ownerId);
  db.keyResult.findFirst.mockResolvedValue(keyResult as never);
  db.keyResult.findUnique.mockResolvedValue(keyResult as never);
  db.keyResult.update.mockResolvedValue(keyResult as never);
  db.keyResult.delete.mockResolvedValue(keyResult as never);
}

// ── Projects ──────────────────────────────────────────────────────────

describe("project.create role gate (mocked)", () => {
  const input = { name: "New project", status: "ACTIVE", priority: "NONE" };

  roleGateCases({
    arrange: (db) => {
      db.project.findFirst.mockResolvedValue(null);
      db.project.create.mockResolvedValue({ id: "project-new", name: "New project", workspaceId } as never);
    },
    act: (caller) => caller.project.create({ ...input, workspaceId }),
    write: (db) => db.project.create,
    // It checked nothing, so anyone who knew the workspace id could write.
    outsider: "FORBIDDEN",
  });

  it("still creates a project with no workspace, without a membership lookup", async () => {
    const dbMock = resetDb();
    dbMock.project.findFirst.mockResolvedValue(null);
    dbMock.project.create.mockResolvedValue({ id: "project-new", name: "New project", workspaceId: null } as never);

    await createMockCaller({ userId: callerId, db: dbMock }).project.create(input);

    expect(dbMock.project.create.mock.calls[0]?.[0].data).toMatchObject({ workspaceId: null, createdById: callerId });
    expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
  });
});

describe("project.updateDates role gate (mocked)", () => {
  const act = (caller: Caller) =>
    caller.project.updateDates({ id: PROJECT.id, startDate: new Date("2026-12-01"), endDate: null });

  roleGateCases({
    arrange: (db) => {
      stubProject(db);
      db.project.update.mockResolvedValue(PROJECT as never);
    },
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

describe("pipeline.create role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.project.findFirst.mockResolvedValue(null);
      db.project.create.mockResolvedValue({ id: "pipeline-new", pipelineStages: [] } as never);
    },
    act: (caller) => caller.pipeline.create({ workspaceId, name: "Sales" }),
    write: (db) => db.project.create,
    outsider: "FORBIDDEN",
  });
});

// ── Meetings ──────────────────────────────────────────────────────────

describe("transcription.createManualTranscription role gate (mocked)", () => {
  const base = { title: "Planning", transcription: "Pat: hello" };
  const arrange = (db: Db) => {
    db.transcriptionSession.create.mockResolvedValue({ id: "meeting-1", title: "Planning", workspaceId } as never);
  };

  describe("filed straight into a workspace", () => {
    roleGateCases({
      arrange,
      act: (caller) => caller.transcription.createManualTranscription({ ...base, workspaceId }),
      write: (db) => db.transcriptionSession.create,
      // Nothing checked the workspace on this path.
      outsider: "FORBIDDEN",
    });
  });

  describe("filed into a project", () => {
    roleGateCases({
      arrange: (db) => {
        arrange(db);
        stubProject(db);
      },
      act: (caller) => caller.transcription.createManualTranscription({ ...base, projectId: PROJECT.id }),
      write: (db) => db.transcriptionSession.create,
    });

    it("refuses an outsider on a public project, which view access let through", async () => {
      const dbMock = resetDb();
      arrange(dbMock);
      stubProject(dbMock, { isPublic: true });
      stubRole(dbMock, null);
      const caller = createMockCaller({ userId: callerId, db: dbMock });

      expect(
        await errorCode(caller.transcription.createManualTranscription({ ...base, projectId: PROJECT.id })),
      ).toBe("FORBIDDEN");
      expect(dbMock.transcriptionSession.create).not.toHaveBeenCalled();
    });
  });

  it("still creates a meeting with no workspace and no project", async () => {
    const dbMock = resetDb();
    dbMock.transcriptionSession.create.mockResolvedValue({ id: "meeting-1", title: "Planning", workspaceId: null } as never);

    await createMockCaller({ userId: callerId, db: dbMock }).transcription.createManualTranscription(base);

    expect(dbMock.transcriptionSession.create).toHaveBeenCalledTimes(1);
    expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
  });
});

describe("transcription.startSession role gate (mocked)", () => {
  const arrange = (db: Db) => {
    db.transcriptionSession.create.mockResolvedValue({
      id: "session-1",
      projectId: null,
      workspaceId,
      meetingDate: null,
    } as never);
  };

  describe("recording straight into a workspace", () => {
    roleGateCases({
      arrange,
      act: (caller) => caller.transcription.startSession({ projectId: null, workspaceId }),
      write: (db) => db.transcriptionSession.create,
      outsider: "FORBIDDEN",
    });
  });

  describe("recording into a project", () => {
    roleGateCases({
      arrange: (db) => {
        arrange(db);
        stubProject(db);
      },
      act: (caller) => caller.transcription.startSession({ projectId: PROJECT.id }),
      write: (db) => db.transcriptionSession.create,
    });
  });
});

describe("workspaceScheduling role gate (mocked)", () => {
  // These two already refused a viewer through the router's own guard, which
  // reads `workspaceUser.findFirst`. That lookup is left empty here, so what
  // these blocks pin is the membership middleware itself asking for edit.
  describe("cancelMeeting", () => {
    roleGateCases({
      arrange: (db) => {
        db.workspaceUser.findFirst.mockResolvedValue(null as never);
        db.meeting.findFirst.mockResolvedValue({ id: "meeting-1", organizerId: callerId } as never);
      },
      act: (caller) => caller.workspaceScheduling.cancelMeeting({ workspaceId, meetingId: "meeting-1" }),
      write: () => cancelScheduledMeetingMock,
    });
  });

  it("createMeeting refuses a viewer at the middleware and books nothing", async () => {
    const dbMock = resetDb();
    dbMock.workspaceUser.findFirst.mockResolvedValue(null as never);
    stubRole(dbMock, "viewer");
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    expect(
      await errorCode(
        caller.workspaceScheduling.createMeeting({
          workspaceId,
          title: "Kickoff",
          startsAt: new Date("2027-01-12T09:00:00Z"),
          endsAt: new Date("2027-01-12T10:00:00Z"),
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(dbMock.meeting.create).not.toHaveBeenCalled();
  });
});

// ── Knowledge chunks ──────────────────────────────────────────────────

describe("knowledgeChunk.ingestTranscription role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.transcriptionSession.findUnique.mockResolvedValue({ id: "meeting-1", workspaceId } as never);
    },
    act: (caller) =>
      caller.knowledgeChunk.ingestTranscription({ transcriptionSessionId: "meeting-1", workspaceId }),
    write: () => embedTranscriptionMock,
  });
});

describe("knowledgeChunk.deleteForSource role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.knowledgeChunk.deleteMany.mockResolvedValue({ count: 4 } as never);
    },
    act: (caller) =>
      caller.knowledgeChunk.deleteForSource({ workspaceId, sourceType: "transcription", sourceId: "meeting-1" }),
    write: (db) => db.knowledgeChunk.deleteMany,
  });
});

// ── Goals ─────────────────────────────────────────────────────────────
// A colleague's goal: these used "any member of the workspace" (the read
// gate) in front of the write, so a viewer could edit and delete it.

describe("goal mutations on a colleague's goal (mocked)", () => {
  const goalId = goalOf(colleagueId).id;

  describe("goal.updateGoalStatus", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, colleagueId),
      act: (caller) => caller.goal.updateGoalStatus({ id: goalId, status: "active" }),
      write: (db) => db.goal.update,
      outsider: "NOT_FOUND",
    });
  });

  describe("goal.updateGoal", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, colleagueId),
      act: (caller) => caller.goal.updateGoal({ id: goalId, title: "Renamed" }),
      write: (db) => db.goal.update,
      outsider: "NOT_FOUND",
    });
  });

  describe("goal.setParent", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, colleagueId),
      act: (caller) => caller.goal.setParent({ id: goalId, parentGoalId: null }),
      write: (db) => db.goal.update,
    });
  });

  describe("goal.updateGoalIcon", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, colleagueId),
      act: (caller) => caller.goal.updateGoalIcon({ id: goalId, icon: "target", iconColor: null }),
      write: (db) => db.goal.update,
    });
  });

  describe("goal.setProgressOverride", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, colleagueId),
      act: (caller) => caller.goal.setProgressOverride({ id: goalId, progress: 40 }),
      write: (db) => db.goal.update,
    });
  });

  describe("goal.deleteGoal", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, colleagueId),
      act: (caller) => caller.goal.deleteGoal({ id: goalId }),
      write: (db) => db.goal.delete,
      outsider: "NOT_FOUND",
    });
  });

  describe("goalUpdate.addUpdate (it moves the goal's health)", () => {
    roleGateCases({
      arrange: (db) => {
        stubGoal(db, colleagueId);
        db.goalUpdate.create.mockResolvedValue({ id: "update-1" } as never);
      },
      act: (caller) => caller.goalUpdate.addUpdate({ goalId, content: "Slipping", health: "at-risk" }),
      write: (db) => db.goalUpdate.create,
    });
  });
});

describe("goal.createGoal role gate (mocked)", () => {
  // Already refused before this audit; pinned so it stays that way.
  roleGateCases({
    arrange: (db) => stubGoal(db, callerId),
    act: (caller) => caller.goal.createGoal({ title: "Grow revenue", workspaceId }),
    write: (db) => db.goal.create,
    outsider: "FORBIDDEN",
  });
});

describe("a viewer who owns the goal (mocked)", () => {
  // Ownership used to be enough: someone who created a goal, then became a
  // viewer, kept every write on it.
  const goalId = goalOf(callerId).id;

  describe("goal.updateGoal", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, callerId),
      act: (caller) => caller.goal.updateGoal({ id: goalId, title: "Renamed" }),
      write: (db) => db.goal.update,
    });
  });

  describe("okr.setObjectiveStatusOverride", () => {
    roleGateCases({
      arrange: (db) => stubGoal(db, callerId),
      act: (caller) => caller.okr.setObjectiveStatusOverride({ goalId, status: "at-risk" }),
      write: (db) => db.goal.update,
    });
  });

  describe("okr.create (a key result on their objective)", () => {
    roleGateCases({
      arrange: (db) => {
        stubGoal(db, callerId);
        db.keyResult.create.mockResolvedValue({ id: "kr-new", title: "New", workspaceId } as never);
      },
      act: (caller) =>
        caller.okr.create({ goalId, title: "New", targetValue: 10, period: "Q4-2026" }),
      write: (db) => db.keyResult.create,
    });
  });
});

it("a personal goal is still its owner's to change, whatever they are elsewhere", async () => {
  const dbMock = resetDb();
  const personal = { ...goalOf(callerId), workspaceId: null };
  dbMock.goal.findFirst.mockResolvedValue(personal as never);
  dbMock.goal.update.mockResolvedValue(personal as never);

  await createMockCaller({ userId: callerId, db: dbMock }).goal.updateGoalStatus({
    id: personal.id,
    status: "active",
  });

  expect(dbMock.goal.update).toHaveBeenCalledTimes(1);
  expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
});

// ── Key results ───────────────────────────────────────────────────────

describe("key result links on a colleague's key result (mocked)", () => {
  // "Owner or any member" gated these, so a viewer could rewrite the links.
  const keyResultId = keyResultOf(colleagueId).id;
  const FEATURE = { id: "feature-1", goalId: 7, product: { workspaceId } };

  describe("okr.updateLinkedFeatures", () => {
    roleGateCases({
      arrange: (db) => {
        stubKeyResult(db, colleagueId);
        db.keyResultFeature.deleteMany.mockResolvedValue({ count: 1 } as never);
      },
      act: (caller) => caller.okr.updateLinkedFeatures({ keyResultId, featureIds: [] }),
      write: (db) => db.keyResultFeature.deleteMany,
      outsider: "NOT_FOUND",
    });
  });

  describe("okr.linkFeature", () => {
    roleGateCases({
      arrange: (db) => {
        stubKeyResult(db, colleagueId);
        db.feature.findUnique.mockResolvedValue(FEATURE as never);
      },
      act: (caller) => caller.okr.linkFeature({ keyResultId, featureId: FEATURE.id }),
      write: (db) => db.keyResultFeature.upsert,
    });
  });

  describe("okr.unlinkFeature", () => {
    roleGateCases({
      arrange: (db) => {
        stubKeyResult(db, colleagueId);
        db.feature.findUnique.mockResolvedValue(FEATURE as never);
        db.keyResultFeature.deleteMany.mockResolvedValue({ count: 1 } as never);
      },
      act: (caller) => caller.okr.unlinkFeature({ keyResultId, featureId: FEATURE.id }),
      write: (db) => db.keyResultFeature.deleteMany,
      outsider: "NOT_FOUND",
    });
  });
});

describe("a viewer who owns the key result (mocked)", () => {
  const keyResultId = keyResultOf(callerId).id;

  describe("okr.update", () => {
    roleGateCases({
      arrange: (db) => stubKeyResult(db, callerId),
      act: (caller) => caller.okr.update({ id: keyResultId, title: "Renamed" }),
      write: (db) => db.keyResult.update,
    });
  });

  describe("okr.checkIn", () => {
    roleGateCases({
      arrange: (db) => {
        stubKeyResult(db, callerId);
        db.keyResultCheckIn.create.mockResolvedValue({ id: "checkin-1" } as never);
      },
      act: (caller) => caller.okr.checkIn({ keyResultId, newValue: 30 }),
      write: (db) => db.keyResultCheckIn.create,
    });
  });

  describe("okr.delete", () => {
    roleGateCases({
      arrange: (db) => stubKeyResult(db, callerId),
      act: (caller) => caller.okr.delete({ id: keyResultId }),
      write: (db) => db.keyResult.delete,
    });
  });

  describe("okr.updateLinkedProjects", () => {
    roleGateCases({
      arrange: (db) => {
        stubKeyResult(db, callerId);
        db.keyResultProject.deleteMany.mockResolvedValue({ count: 1 } as never);
      },
      act: (caller) => caller.okr.updateLinkedProjects({ keyResultId, projectIds: [] }),
      write: (db) => db.keyResultProject.deleteMany,
    });
  });

  describe("okr.setKeyResultStatusOverride", () => {
    roleGateCases({
      arrange: (db) => stubKeyResult(db, callerId),
      act: (caller) => caller.okr.setKeyResultStatusOverride({ keyResultId, status: "at-risk" }),
      write: (db) => db.keyResult.update,
    });
  });
});

it("a member can still check in on a colleague's key result", async () => {
  const dbMock = resetDb();
  stubKeyResult(dbMock, colleagueId);
  dbMock.keyResultCheckIn.create.mockResolvedValue({ id: "checkin-1" } as never);
  stubRole(dbMock, "member");

  await createMockCaller({ userId: callerId, db: dbMock }).okr.checkIn({
    keyResultId: keyResultOf(colleagueId).id,
    newValue: 30,
  });

  expect(dbMock.keyResultCheckIn.create).toHaveBeenCalledTimes(1);
});

// ── What a viewer may still do ────────────────────────────────────────

describe("reading and commenting stay open to a viewer (mocked)", () => {
  it("lets a viewer read a goal and recompute its derived health", async () => {
    const dbMock = resetDb();
    stubGoal(dbMock, colleagueId);
    // The recompute reads the goal with the rows its health derives from.
    dbMock.goal.findUnique.mockResolvedValue({
      ...goalOf(colleagueId),
      keyResults: [],
      projects: [],
      childGoals: [],
    } as never);
    stubRole(dbMock, "viewer");
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(caller.goalUpdate.getUpdates({ goalId: 7 })).resolves.toBeUndefined();
    await expect(caller.goal.recomputeHealth({ id: 7 })).resolves.toBe("no-update");
  });

  it("refuses a health recompute on a goal the caller cannot see", async () => {
    const dbMock = resetDb();
    stubGoal(dbMock, colleagueId);
    stubRole(dbMock, null);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(caller.goal.recomputeHealth({ id: 7 })).rejects.toThrow(/access denied/i);
    expect(dbMock.goal.update).not.toHaveBeenCalled();
  });

  it("leaves goal comments on the read gate, like page comments", async () => {
    const dbMock = resetDb();
    stubGoal(dbMock, colleagueId);
    dbMock.goalComment.create.mockResolvedValue({ id: "comment-1" } as never);
    stubRole(dbMock, "viewer");

    await createMockCaller({ userId: callerId, db: dbMock }).goalComment.addComment({
      goalId: 7,
      content: "Looks right to me",
    });

    expect(dbMock.goalComment.create).toHaveBeenCalledTimes(1);
  });
});
