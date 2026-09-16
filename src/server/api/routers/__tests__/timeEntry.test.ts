/**
 * Router tests for the Daily worklog procedures (ADR-0061):
 *
 * - `timeEntry.create` / `upsertBySourceRef` under an agent key write an entry
 *   OWNED by the agent's owner, record the agent as author and are forced to
 *   PROPOSED; a human's entry is their own and CONFIRMED by default;
 * - access runs against the owner, not the shadow user (an Action only the
 *   agent can reach is NOT_FOUND);
 * - error cases: BAD_REQUEST on an inverted range, CONFLICT on a sourceRef
 *   another user holds, FORBIDDEN for an agent key with no bound agent;
 * - `action.upsertBySource` reuses the (sourceType, sourceId) match.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). Mirrors externalAgentGrant.test.ts.
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

vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn().mockResolvedValue(true),
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

import { createCaller } from "~/server/api/root";
import { createMockCaller } from "~/test/trpc-helpers";
import { recordActivity } from "~/server/services/activity/recordActivity";

const OWNER_ID = "owner-1";
const AGENT_ID = "agent-1";
const SHADOW_ID = "shadow-1";
const ACTION_ID = "action-1";
const WS_ID = "ws-1";

const START = new Date("2026-09-11T09:22:00Z");
const END = new Date("2026-09-11T10:30:00Z"); // 68 minutes

function humanCaller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: OWNER_ID, db: db as unknown as PrismaClient });
}

/** The context an `exp_agent_…` key produces: the shadow user's session, tokenType "agent-key". */
function agentCaller(db: DeepMockProxy<PrismaClient>) {
  return createCaller({
    db: db as unknown as PrismaClient,
    session: {
      user: { id: SHADOW_ID, email: "shadow@agents.test", name: "claude", image: null, isAdmin: false },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    headers: new Headers(),
    tokenType: "agent-key",
  });
}

/**
 * One Action row that satisfies both reads on the path: the access
 * resolver's `select { createdById, projectId, assignees }` and the service's
 * `select { id, workspaceId }`.
 */
function arrangeAction(db: DeepMockProxy<PrismaClient>, createdById: string) {
  db.action.findUnique.mockResolvedValue({
    id: ACTION_ID,
    createdById,
    projectId: null,
    workspaceId: WS_ID,
    assignees: [],
  } as never);
}

function arrangeAgent(db: DeepMockProxy<PrismaClient>) {
  db.externalAgent.findUnique.mockResolvedValue({ id: AGENT_ID, ownerId: OWNER_ID } as never);
}

function withTransaction(db: DeepMockProxy<PrismaClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db.$transaction as any).mockImplementation(async (fn: any) => fn(db));
}

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    userId: OWNER_ID,
    actionId: ACTION_ID,
    workspaceId: WS_ID,
    startedAt: START,
    endedAt: END,
    source: "claude-desktop",
    status: "PROPOSED",
    sourceRef: null,
    note: null,
    createdByAgentId: AGENT_ID,
    createdAt: START,
    updatedAt: START,
    action: { id: ACTION_ID, name: "Action modal close latency", projectId: null, workspaceId: WS_ID },
    ...overrides,
  };
}

describe("timeEntry.create — ADR-0061 owner carve-out", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    vi.mocked(recordActivity).mockClear();
    withTransaction(db);
    db.timeEntry.findFirst.mockResolvedValue(null); // no sourceRef holder
  });

  it("agent key → entry owned by the OWNER, agent recorded as author, PROPOSED forced", async () => {
    arrangeAgent(db);
    arrangeAction(db, OWNER_ID);
    db.timeEntry.create.mockResolvedValue(entryRow() as never);

    const result = await agentCaller(db).timeEntry.create({
      actionId: ACTION_ID,
      startedAt: START,
      endedAt: END,
      source: "claude-desktop",
      status: "CONFIRMED", // asked for, refused
      sourceRef: "claude-session:s1#0",
      note: "PR 642",
    });

    expect(result.userId).toBe(OWNER_ID);
    expect(db.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: OWNER_ID,
          createdByAgentId: AGENT_ID,
          status: "PROPOSED",
          source: "claude-desktop",
          sourceRef: "claude-session:s1#0",
          note: "PR 642",
          workspaceId: WS_ID,
        }),
      }),
    );
    // Proposed time never moves Action.timeSpentMins nor the activity feed.
    expect(db.action.update).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
    // And never touches the running Timer (autoStop would update an entry).
    expect(db.timeEntry.update).not.toHaveBeenCalled();
  });

  it("human → their own entry, CONFIRMED by default, spent time incremented", async () => {
    arrangeAction(db, OWNER_ID);
    db.timeEntry.create.mockResolvedValue(
      entryRow({ status: "CONFIRMED", createdByAgentId: null, source: "manual" }) as never,
    );

    await humanCaller(db).timeEntry.create({ actionId: ACTION_ID, startedAt: START, endedAt: END });

    expect(db.externalAgent.findUnique).not.toHaveBeenCalled();
    expect(db.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: OWNER_ID, createdByAgentId: null, status: "CONFIRMED", source: "manual" }),
      }),
    );
    expect(db.action.update).toHaveBeenCalledWith({
      where: { id: ACTION_ID },
      data: { timeSpentMins: { increment: 68 } },
    });
    expect(recordActivity).toHaveBeenCalledTimes(1);
  });

  it("access runs against the owner: an Action only the shadow user can see is NOT_FOUND", async () => {
    arrangeAgent(db);
    arrangeAction(db, SHADOW_ID); // created by the agent, invisible to the owner

    await expect(
      agentCaller(db).timeEntry.create({ actionId: ACTION_ID, startedAt: START, endedAt: END }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });

  it("agent key with no bound external agent is FORBIDDEN", async () => {
    db.externalAgent.findUnique.mockResolvedValue(null);

    await expect(
      agentCaller(db).timeEntry.create({ actionId: ACTION_ID, startedAt: START, endedAt: END }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("endedAt at or before startedAt is BAD_REQUEST", async () => {
    arrangeAction(db, OWNER_ID);
    await expect(
      humanCaller(db).timeEntry.create({ actionId: ACTION_ID, startedAt: END, endedAt: START }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });

  it("a sourceRef another user holds is CONFLICT", async () => {
    arrangeAgent(db);
    arrangeAction(db, OWNER_ID);
    db.timeEntry.findFirst.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(
      agentCaller(db).timeEntry.create({
        actionId: ACTION_ID,
        startedAt: START,
        endedAt: END,
        sourceRef: "claude-session:theirs#0",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });
});

describe("timeEntry.upsertBySourceRef", () => {
  let db: DeepMockProxy<PrismaClient>;

  /** Mock order: foreign-ref check, then the ref family, then manual time. */
  function arrangeRows(family: unknown[], manual: unknown[]) {
    db.timeEntry.findFirst.mockResolvedValue(null);
    db.timeEntry.findMany.mockResolvedValueOnce(family as never).mockResolvedValueOnce(manual as never);
  }

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    vi.mocked(recordActivity).mockClear();
    withTransaction(db);
    arrangeAgent(db);
    arrangeAction(db, OWNER_ID);
  });

  it("no row for (owner, ref) → created, owned by the owner", async () => {
    arrangeRows([], []);
    db.timeEntry.create.mockResolvedValue(entryRow({ sourceRef: "claude-session:s1#0" }) as never);

    const result = await agentCaller(db).timeEntry.upsertBySourceRef({
      actionId: ACTION_ID,
      startedAt: START,
      endedAt: END,
      source: "claude-desktop",
      sourceRef: "claude-session:s1#0",
    });

    expect(result.outcome).toBe("created");
    expect(result.entry?.userId).toBe(OWNER_ID);
    expect(db.timeEntry.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ userId: OWNER_ID }),
      }),
    );
    expect(db.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: OWNER_ID, createdByAgentId: AGENT_ID, status: "PROPOSED" }),
      }),
    );
  });

  it("PROPOSED match → updated in place, still no spent-time arithmetic", async () => {
    arrangeRows([entryRow({ sourceRef: "claude-session:s1#0" })], []);
    db.timeEntry.update.mockResolvedValue(entryRow({ sourceRef: "claude-session:s1#0", note: "run 2" }) as never);

    const result = await agentCaller(db).timeEntry.upsertBySourceRef({
      actionId: ACTION_ID,
      startedAt: START,
      endedAt: END,
      sourceRef: "claude-session:s1#0",
      note: "run 2",
    });

    expect(result.outcome).toBe("updated");
    expect(db.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entry-1" },
        data: expect.objectContaining({ note: "run 2", startedAt: START, endedAt: END, actionId: ACTION_ID }),
      }),
    );
    expect(db.timeEntry.create).not.toHaveBeenCalled();
    expect(db.action.update).not.toHaveBeenCalled();
  });

  it("CONFIRMED match → left untouched", async () => {
    arrangeRows([entryRow({ sourceRef: "claude-session:s1#0", status: "CONFIRMED" })], []);

    const result = await agentCaller(db).timeEntry.upsertBySourceRef({
      actionId: ACTION_ID,
      startedAt: START,
      endedAt: new Date("2026-09-11T11:59:00Z"),
      sourceRef: "claude-session:s1#0",
      note: "run 3",
    });

    expect(result.outcome).toBe("left");
    expect(result.entry?.status).toBe("CONFIRMED");
    expect(db.timeEntry.update).not.toHaveBeenCalled();
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });

  it("manual time on the same Action wins → merged, the manual note carries the ref", async () => {
    arrangeRows(
      [],
      [{ id: "manual-1", actionId: ACTION_ID, startedAt: START, endedAt: END, note: null }],
    );

    const result = await agentCaller(db).timeEntry.upsertBySourceRef({
      actionId: ACTION_ID,
      startedAt: new Date("2026-09-11T09:30:00Z"),
      endedAt: new Date("2026-09-11T10:00:00Z"),
      sourceRef: "claude-session:s1#0",
    });

    expect(result.outcome).toBe("merged");
    expect(result.mergedInto).toEqual(["manual-1"]);
    expect(db.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "manual-1" },
      data: { note: "claude-session:s1#0" },
    });
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });
});

describe("timeEntry.confirmDay — human-only", () => {
  let db: DeepMockProxy<PrismaClient>;
  const day = new Date("2026-09-11T00:00:00");

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    vi.mocked(recordActivity).mockClear();
    withTransaction(db);
  });

  it("an agent key is FORBIDDEN before anything is read", async () => {
    await expect(agentCaller(db).timeEntry.confirmDay({ date: day })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("an agent principal on any other token is FORBIDDEN too", async () => {
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    await expect(humanCaller(db).timeEntry.confirmDay({ date: day })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("a human confirms the 24 hours from the given day start", async () => {
    db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    db.timeEntry.findMany.mockResolvedValue([
      entryRow({ startedAt: new Date("2026-09-11T13:38:00"), endedAt: new Date("2026-09-11T14:30:00") }),
    ] as never);
    db.timeEntry.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await humanCaller(db).timeEntry.confirmDay({ date: day });

    expect(result).toEqual({ confirmed: 1 });
    expect(db.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: OWNER_ID,
          status: "PROPOSED",
          startedAt: { gte: day, lt: new Date(day.getTime() + 24 * 60 * 60 * 1000) },
        }),
      }),
    );
    expect(db.action.update).toHaveBeenCalledWith({
      where: { id: ACTION_ID },
      data: { timeSpentMins: { increment: 52 } },
    });
  });
});

describe("timeEntry.listByDateRange under an agent key", () => {
  it("lists the OWNER's entries, not the shadow user's", async () => {
    const db = getDbMock();
    mockReset(db);
    arrangeAgent(db);
    db.timeEntry.findMany.mockResolvedValue([] as never);

    await agentCaller(db).timeEntry.listByDateRange({ startDate: START, endDate: END });

    expect(db.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: OWNER_ID }) }),
    );
  });
});

describe("timeEntry.rememberResolution", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("an agent key is FORBIDDEN", async () => {
    await expect(
      agentCaller(db).timeEntry.rememberResolution({ titlePattern: "Ontology one-pager", projectId: "p1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.timeResolutionRule.upsert).not.toHaveBeenCalled();
  });

  it("a human upserts one rule per title, keyed on the trimmed title", async () => {
    db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    db.project.findUnique.mockResolvedValue({
      id: "p1",
      createdById: OWNER_ID,
      workspaceId: WS_ID,
      teamId: null,
      isPublic: false,
      workspace: null,
    } as never);
    db.timeResolutionRule.upsert.mockResolvedValue({ id: "rule-1" } as never);

    await humanCaller(db).timeEntry.rememberResolution({ titlePattern: "  Ontology one-pager ", projectId: "p1" });

    expect(db.timeResolutionRule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_titlePattern: { userId: OWNER_ID, titlePattern: "Ontology one-pager" } },
        create: expect.objectContaining({ projectId: "p1", ticketId: null }),
      }),
    );
  });

  it("needs exactly one of projectId or ticketId", async () => {
    await expect(
      humanCaller(db).timeEntry.rememberResolution({ titlePattern: "x", projectId: "p1", ticketId: "t1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(humanCaller(db).timeEntry.rememberResolution({ titlePattern: "x" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("action.upsertBySource", () => {
  let db: DeepMockProxy<PrismaClient>;

  const created = {
    id: "action-new",
    name: "Action modal close latency",
    workspaceId: WS_ID,
    project: null,
    ticket: null,
  };

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    vi.mocked(recordActivity).mockClear();
    // Member of the workspace (getWorkspaceMembership's direct path).
    db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WS_ID } as never);
  });

  it("no match → created with the source pair; an agent stamps source 'agent' and assigns its OWNER (ADR-0049, ADR-0061)", async () => {
    arrangeAgent(db);
    db.action.findFirst.mockResolvedValue(null);
    db.action.create.mockResolvedValue(created as never);

    const result = await agentCaller(db).action.upsertBySource({
      sourceType: "claude-session",
      sourceId: "s1",
      name: "Action modal close latency",
      workspaceId: WS_ID,
    });

    expect(result.outcome).toBe("created");
    expect(db.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: "claude-session",
          sourceId: "s1",
          workspaceId: WS_ID,
          createdById: SHADOW_ID,
          source: "agent",
          // The owner must be able to view the Action to have time logged on it.
          assignees: { create: { userId: OWNER_ID } },
        }),
      }),
    );
  });

  it("an agent refreshing an existing Action also assigns its owner, idempotently", async () => {
    arrangeAgent(db);
    db.action.findFirst.mockResolvedValue({ id: "action-existing" } as never);
    db.action.update.mockResolvedValue({ ...created, id: "action-existing" } as never);

    await agentCaller(db).action.upsertBySource({
      sourceType: "claude-session",
      sourceId: "s1",
      name: "v2",
      workspaceId: WS_ID,
    });

    expect(db.action.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignees: {
            connectOrCreate: {
              where: { actionId_userId: { actionId: "action-existing", userId: OWNER_ID } },
              create: { userId: OWNER_ID },
            },
          },
        }),
      }),
    );
  });

  it("applies a remembered rule for the owner when the incoming Action has no Project or Ticket", async () => {
    arrangeAgent(db);
    db.action.findFirst.mockResolvedValue(null);
    db.action.create.mockResolvedValue(created as never);
    db.timeResolutionRule.findFirst.mockResolvedValue({
      projectId: "proj-ontology",
      ticketId: null,
      project: { workspaceId: WS_ID },
      ticket: null,
    } as never);

    await agentCaller(db).action.upsertBySource({
      sourceType: "claude-session",
      sourceId: "s2",
      name: "Ontology one-pager",
      workspaceId: WS_ID,
    });

    expect(db.timeResolutionRule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: OWNER_ID,
          titlePattern: { equals: "Ontology one-pager", mode: "insensitive" },
        }),
      }),
    );
    expect(db.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: "proj-ontology", kanbanStatus: "TODO" }),
      }),
    );
  });

  it("ignores a rule pointing at another workspace, and never consults rules when a link is given", async () => {
    arrangeAgent(db);
    db.action.findFirst.mockResolvedValue(null);
    db.action.create.mockResolvedValue(created as never);
    db.timeResolutionRule.findFirst.mockResolvedValue({
      projectId: "proj-elsewhere",
      ticketId: null,
      project: { workspaceId: "ws-other" },
      ticket: null,
    } as never);

    await agentCaller(db).action.upsertBySource({
      sourceType: "claude-session",
      sourceId: "s3",
      name: "Ontology one-pager",
      workspaceId: WS_ID,
    });
    const data = (db.action.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.projectId).toBeUndefined();

    db.timeResolutionRule.findFirst.mockClear();
    db.ticket.findUnique.mockResolvedValue({ product: { workspaceId: WS_ID } } as never);
    await agentCaller(db).action.upsertBySource({
      sourceType: "claude-session",
      sourceId: "s4",
      name: "Ontology one-pager",
      workspaceId: WS_ID,
      ticketId: "ticket-1",
    });
    expect(db.timeResolutionRule.findFirst).not.toHaveBeenCalled();
  });

  it("a human upsert assigns nobody", async () => {
    db.action.findFirst.mockResolvedValue(null);
    db.action.create.mockResolvedValue(created as never);

    await humanCaller(db).action.upsertBySource({
      sourceType: "claude-session",
      sourceId: "s1",
      name: "x",
      workspaceId: WS_ID,
    });

    expect(db.externalAgent.findUnique).not.toHaveBeenCalled();
    const data = (db.action.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("assignees");
  });

  it("match on (workspace, sourceType, sourceId) → name refreshed, no second Action", async () => {
    db.action.findFirst.mockResolvedValue({ id: "action-existing" } as never);
    db.action.update.mockResolvedValue({ ...created, id: "action-existing", name: "v2" } as never);

    const result = await humanCaller(db).action.upsertBySource({
      sourceType: "claude-session",
      sourceId: "s1",
      name: "v2",
      workspaceId: WS_ID,
    });

    expect(result.outcome).toBe("updated");
    expect(db.action.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_ID, sourceType: "claude-session", sourceId: "s1" }),
      }),
    );
    expect(db.action.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "action-existing" }, data: expect.objectContaining({ name: "v2" }) }),
    );
    expect(db.action.create).not.toHaveBeenCalled();
  });

  it("a ticket from another workspace is NOT_FOUND, never linked", async () => {
    db.ticket.findUnique.mockResolvedValue({ product: { workspaceId: "ws-other" } } as never);

    await expect(
      humanCaller(db).action.upsertBySource({
        sourceType: "claude-session",
        sourceId: "s1",
        name: "x",
        workspaceId: WS_ID,
        ticketId: "ticket-elsewhere",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.action.create).not.toHaveBeenCalled();
    expect(db.action.update).not.toHaveBeenCalled();
  });

  it("a non-member cannot mint Actions in the workspace", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    db.teamUser.findFirst.mockResolvedValue(null);

    await expect(
      humanCaller(db).action.upsertBySource({
        sourceType: "claude-session",
        sourceId: "s1",
        name: "x",
        workspaceId: WS_ID,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
