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

  it("no match → created with the source pair; an agent stamps source 'agent' (ADR-0049)", async () => {
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
        }),
      }),
    );
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
