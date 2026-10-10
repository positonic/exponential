/**
 * The run tools' callbacks (ADR-0067, Agent PRD D5): they resolve the run from
 * the JWT claim, write as the shadow user, append events with increasing seq,
 * and refuse anything that is not a live run of the caller. Mocked Prisma.
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
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (cb: () => unknown) => void cb(),
}));
const containmentMock = vi.fn().mockResolvedValue(undefined);
vi.mock("~/server/services/actions/containment", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  assertAssignableUsers: (...args: unknown[]) => containmentMock(...args),
}));
const mentionMock = vi.fn();
vi.mock("~/server/services/notifications/emit/mentionAdapters", () => ({
  emitActionCommentMention: (...args: unknown[]) => mentionMock(...args),
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
  const proxy = new Proxy({}, { get(_t, prop) { return (getDbMock() as unknown as Record<string | symbol, unknown>)[prop as string]; } });
  return { db: proxy };
});

import { createMockCaller } from "~/test/trpc-helpers";

const SHADOW = "shadow-1";
const RUN = "run-1";
const ACTION = "action-1";
const liveRun = {
  id: RUN,
  status: "RUNNING",
  actionId: ACTION,
  toolCallCount: 0,
  agent: { id: "agent-1", ownerId: "owner-1", shadowUserId: SHADOW },
};

function runCaller(db: DeepMockProxy<PrismaClient>, overrides: { tokenType?: string; agentRunId?: string; userId?: string } = {}) {
  return createMockCaller({
    userId: overrides.userId ?? SHADOW,
    db,
    tokenType: "tokenType" in overrides ? overrides.tokenType : "agent-context",
    agentRunId: "agentRunId" in overrides ? overrides.agentRunId : RUN,
  });
}

describe("mastra run callbacks", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    mentionMock.mockReset();
    db.agentRun.findFirst.mockResolvedValue(liveRun as never);
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 2 } } as never);
    db.agentRunEvent.create.mockImplementation(((args: { data: { seq: number } }) =>
      Promise.resolve({ id: "ev", seq: args.data.seq })) as never);
    db.agentRun.update.mockResolvedValue({} as never);
  });

  it("reportProgress appends a text event with the next seq to the run named by the JWT claim", async () => {
    await runCaller(db).mastra.reportProgress({ text: "Searching the CRM" });

    expect(db.agentRun.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: RUN, agent: { shadowUserId: SHADOW } },
    });
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { runId: RUN, seq: 3, kind: "text", payload: { text: "Searching the CRM" } },
    });
  });

  it("refuses a caller without a run token (a human session, an agent key)", async () => {
    await expect(runCaller(db, { tokenType: undefined, agentRunId: undefined }).mastra.reportProgress({ text: "x" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(runCaller(db, { tokenType: "agent-key", agentRunId: undefined }).mastra.reportProgress({ text: "x" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.agentRunEvent.create).not.toHaveBeenCalled();
  });

  it("refuses an ordinary human session even when it carries a runId", async () => {
    // A web session has no token type; a stray runId claim must not open the callbacks.
    await expect(runCaller(db, { tokenType: undefined, agentRunId: RUN, userId: "owner-1" }).mastra.commentOnAction({ markdown: "x" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    // An agent-key principal (another External agent) with a runId is refused too.
    await expect(runCaller(db, { tokenType: "agent-key", agentRunId: RUN }).mastra.finishRun({ summary: "x", readyToClose: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.actionComment.create).not.toHaveBeenCalled();
    expect(db.agentRun.update).not.toHaveBeenCalled();
  });

  it("reassignAction checks containment as the owner, not as the shadow user", async () => {
    containmentMock.mockClear();
    db.action.findUniqueOrThrow.mockResolvedValue({ projectId: null, teamId: null, workspaceId: "ws-1" } as never);
    db.actionAssignee.createMany.mockResolvedValue({ count: 1 } as never);
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "u2", name: "Andi", isAgent: false } as never);
    db.externalAgent.findMany.mockResolvedValue([] as never);

    await runCaller(db).mastra.reassignAction({ userId: "u2" });

    // Delegation: the permission subject is the owner (ADR-0049/0067).
    expect(containmentMock).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      { projectId: null, teamId: null, workspaceId: "ws-1" },
      ["u2"],
    );
  });

  it("refuses a run that is not the caller's, and a run that is no longer live", async () => {
    db.agentRun.findFirst.mockResolvedValue(null as never);
    await expect(runCaller(db, { userId: "someone-else" }).mastra.reportProgress({ text: "x" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    db.agentRun.findFirst.mockResolvedValue({ ...liveRun, status: "CANCELLED" } as never);
    await expect(runCaller(db).mastra.reportProgress({ text: "x" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.agentRunEvent.create).not.toHaveBeenCalled();
  });

  it("commentOnAction posts a real comment authored by the shadow user, emits mentions, and logs a tool_call", async () => {
    db.actionComment.create.mockResolvedValue({ id: "c1", author: { id: SHADOW, name: "Aria", image: null } } as never);
    db.action.findUnique.mockResolvedValue({ workspaceId: "ws-1", project: null } as never);

    const result = await runCaller(db).mastra.commentOnAction({ markdown: "Found two venues." });

    expect(result).toEqual({ commentId: "c1" });
    expect(db.actionComment.create.mock.calls[0]?.[0]).toMatchObject({
      data: { actionId: ACTION, authorId: SHADOW, content: "Found two venues." },
    });
    expect(mentionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ commentId: "c1", commentAuthorId: SHADOW }));
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { kind: "tool_call", payload: { tool: "comment-on-action", commentId: "c1" } },
    });
  });

  it("finishRun records summary and readyToClose without finalising status (the dispatcher does)", async () => {
    await runCaller(db).mastra.finishRun({ summary: "Done.", readyToClose: true });
    const update = db.agentRun.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(update).toMatchObject({ where: { id: RUN }, data: { summary: "Done.", readyToClose: true } });
    expect(update.data).not.toHaveProperty("status");
  });
});

describe("agentRun.listForAction", () => {
  let db: DeepMockProxy<PrismaClient>;
  const runRow = {
    id: RUN, status: "SUCCEEDED", executor: "MASTRA", startedAt: null, finishedAt: null, lastEventAt: null,
    createdAt: new Date(), toolCallCount: 2, summary: "s", readyToClose: false, error: "Mastra 500: internal", requestedById: "owner-1",
    agent: { id: "agent-1", name: "Aria", ownerId: "owner-1", shadowUser: { id: SHADOW, name: "Aria", image: null }, assistant: { emoji: null } },
  };

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    // view access: creator of the action
    db.action.findUnique.mockResolvedValue({ id: ACTION, createdById: "owner-1", projectId: null, teamId: null, workspaceId: "ws-1", assignees: [], project: null } as never);
    db.action.findFirst.mockResolvedValue({ id: ACTION } as never);
    db.agentRun.findMany.mockResolvedValue([runRow] as never);
    db.agentRunEvent.findMany.mockResolvedValue([{ id: "e1", runId: RUN, seq: 1, kind: "text", payload: {}, createdAt: new Date() }] as never);
  });

  it("sends events only to the agent's owner; a non-owner viewer gets none and no event query runs for them", async () => {
    const owner = await createMockCaller({ userId: "owner-1", db }).agentRun.listForAction({ actionId: ACTION });
    expect(owner[0]?.isOwner).toBe(true);
    expect(owner[0]?.events).toHaveLength(1);
    expect(owner[0]?.error).toBe("Mastra 500: internal");

    mockReset(db);
    db.action.findUnique.mockResolvedValue({ id: ACTION, createdById: "viewer-1", projectId: null, teamId: null, workspaceId: "ws-1", assignees: [], project: null } as never);
    db.action.findFirst.mockResolvedValue({ id: ACTION } as never);
    db.agentRun.findMany.mockResolvedValue([runRow] as never);
    const viewer = await createMockCaller({ userId: "viewer-1", db }).agentRun.listForAction({ actionId: ACTION });
    expect(viewer[0]?.isOwner).toBe(false);
    expect(viewer[0]?.events).toBeUndefined();
    expect(db.agentRunEvent.findMany).not.toHaveBeenCalled();
    // status, duration fields, tool count and summary are still exposed; the raw error is not
    expect(viewer[0]).toMatchObject({ status: "SUCCEEDED", toolCallCount: 2, summary: "s", error: null });
  });
});

describe("mastra.askOwner", () => {
  let db: DeepMockProxy<PrismaClient>;
  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    mentionMock.mockReset();
    db.agentRun.findFirst.mockResolvedValue(liveRun as never);
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 1 } } as never);
    db.agentRunEvent.create.mockResolvedValue({ id: "ev", seq: 2 } as never);
    db.agentRun.update.mockResolvedValue({} as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "owner-1", name: "James" } as never);
    db.actionComment.create.mockResolvedValue({ id: "c1", author: { id: SHADOW, name: "Aria", image: null } } as never);
    db.action.findUnique.mockResolvedValue({ workspaceId: "ws-1", project: null } as never);
  });

  it("comments with the owner mentioned, logs ask-owner, moves the run to WAITING_ON_OWNER, and tells the agent to stop", async () => {
    const result = await runCaller(db).mastra.askOwner({ question: "12 or 19 Nov?" });

    expect(db.actionComment.create.mock.calls[0]?.[0]).toMatchObject({
      data: { actionId: ACTION, authorId: SHADOW, content: "@[James](owner-1) 12 or 19 Nov?" },
    });
    expect(mentionMock).toHaveBeenCalledTimes(1);
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { kind: "tool_call", payload: { tool: "ask-owner", commentId: "c1" } },
    });
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: RUN, status: "RUNNING" },
      data: { status: "WAITING_ON_OWNER" },
    });
    expect(result).toMatchObject({ stop: true, status: "WAITING_ON_OWNER", commentId: "c1" });
  });

  it("strips mention-breaking characters from the owner's display name", async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "owner-1", name: "James [Ops] (he)" } as never);
    await runCaller(db).mastra.askOwner({ question: "q?" });
    expect(db.actionComment.create.mock.calls[0]?.[0]).toMatchObject({
      data: { content: "@[James Ops he](owner-1) q?" },
    });
  });

  it("refuses without a run token", async () => {
    await expect(runCaller(db, { tokenType: undefined, agentRunId: undefined }).mastra.askOwner({ question: "x" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.actionComment.create).not.toHaveBeenCalled();
  });
});

describe("mastra.getRunContext", () => {
  it("is a pure read: no run event is written", async () => {
    const db = getDbMock();
    mockReset(db);
    db.agentRun.findFirst.mockResolvedValue(liveRun as never);
    db.action.findUniqueOrThrow.mockResolvedValue({
      id: ACTION, name: "Find a venue", description: null, status: "ACTIVE", priority: null, dueDate: null,
      workspaceId: "ws-1", projectId: null, project: null, assignees: [], comments: [],
    } as never);
    db.agentRun.findUniqueOrThrow.mockResolvedValue({ wakeCommentId: null, predecessor: null } as never);
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "owner-1", name: "James" } as never);
    db.workspaceUser.findMany.mockResolvedValue([] as never);

    const ctx = await runCaller(db).mastra.getRunContext();

    expect(ctx.action.id).toBe(ACTION);
    expect(ctx.owner).toEqual({ id: "owner-1", name: "James" });
    expect(db.agentRunEvent.create).not.toHaveBeenCalled();
  });

  // ── Positions on members (ADR-0068, Agent PRD D8.4) ─────────────────
  // The run delegates by Remit: members carry the Positions they hold in the
  // action's workspace, and an agent with none carries its description as a
  // fallback Remit. Same mapping as the Assign modal's rosters; the member
  // set itself is unchanged.

  const humanRow = { id: "u-human", name: "Andi", email: "andi@x.test", image: null, isAgent: false, externalAgentShadow: null };
  const assistantRow = {
    id: "u-aria", name: "Aria", email: null, image: null, isAgent: true,
    externalAgentShadow: { description: "Research travel options", assistant: { emoji: null, createdBy: { id: "owner-1", name: "James" } } },
  };
  const plainAgentRow = {
    id: "u-bot", name: "Hermes", email: null, image: null, isAgent: true,
    externalAgentShadow: { description: "Files Sentry bugs", assistant: null },
  };
  const travelResearcher = { id: "pos-1", title: "Travel researcher", remit: "Research travel", notAccountableFor: "Booking" };

  function stubRunContextRead(db: DeepMockProxy<PrismaClient>, action: Record<string, unknown>) {
    mockReset(db);
    db.agentRun.findFirst.mockResolvedValue(liveRun as never);
    db.action.findUniqueOrThrow.mockResolvedValue({
      id: ACTION, name: "Find a venue", description: null, status: "ACTIVE", priority: null, dueDate: null,
      assignees: [], comments: [], ...action,
    } as never);
    db.agentRun.findUniqueOrThrow.mockResolvedValue({ wakeCommentId: null, predecessor: null } as never);
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "owner-1", name: "James" } as never);
  }

  it("members carry the Positions held in the action's workspace, and agentDescription only for an agent with none", async () => {
    const db = getDbMock();
    stubRunContextRead(db, { workspaceId: "ws-1", projectId: null, project: null });
    db.workspaceUser.findMany.mockResolvedValue(
      [{ user: humanRow }, { user: assistantRow }, { user: plainAgentRow }] as never,
    );
    db.positionHolder.findMany.mockResolvedValue([
      { workspaceUser: { userId: "u-aria" }, position: travelResearcher },
    ] as never);

    const ctx = await runCaller(db).mastra.getRunContext();

    // One lookup, scoped to the action's workspace and to these members.
    expect(db.positionHolder.findMany).toHaveBeenCalledTimes(1);
    expect(db.positionHolder.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { position: { workspaceId: "ws-1" }, workspaceUser: { userId: { in: ["u-human", "u-aria", "u-bot"] } } },
    });
    expect(ctx.members).toEqual([
      { id: "u-human", name: "Andi", isAgent: false, assistantOwner: null, positions: [], agentDescription: null },
      {
        id: "u-aria", name: "Aria", isAgent: true, assistantOwner: { id: "owner-1", name: "James" },
        positions: [travelResearcher],
        // Holds a Position, so the description is not its Remit.
        agentDescription: null,
      },
      { id: "u-bot", name: "Hermes", isAgent: true, assistantOwner: null, positions: [], agentDescription: "Files Sentry bugs" },
    ]);
    expect(db.agentRunEvent.create).not.toHaveBeenCalled();
  });

  it("uses the project's workspace for a project action, reading project members", async () => {
    const db = getDbMock();
    stubRunContextRead(db, {
      workspaceId: null, projectId: "p-1", project: { id: "p-1", name: "Madrid trip", workspaceId: "ws-2" },
    });
    db.projectMember.findMany.mockResolvedValue([{ user: humanRow }] as never);
    db.positionHolder.findMany.mockResolvedValue([
      { workspaceUser: { userId: "u-human" }, position: travelResearcher },
    ] as never);

    const ctx = await runCaller(db).mastra.getRunContext();

    expect(db.workspaceUser.findMany).not.toHaveBeenCalled();
    expect(db.positionHolder.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { position: { workspaceId: "ws-2" } },
    });
    expect(ctx.members).toEqual([
      { id: "u-human", name: "Andi", isAgent: false, assistantOwner: null, positions: [travelResearcher], agentDescription: null },
    ]);
  });

  it("gives every member positions: [] and looks nothing up when the action has no workspace", async () => {
    const db = getDbMock();
    stubRunContextRead(db, {
      workspaceId: null, projectId: "p-personal", project: { id: "p-personal", name: "Personal", workspaceId: null },
    });
    db.projectMember.findMany.mockResolvedValue([{ user: humanRow }, { user: plainAgentRow }] as never);

    const ctx = await runCaller(db).mastra.getRunContext();

    expect(db.positionHolder.findMany).not.toHaveBeenCalled();
    expect(ctx.members.map((m) => [m.id, m.positions, m.agentDescription])).toEqual([
      ["u-human", [], null],
      ["u-bot", [], "Files Sentry bugs"],
    ]);
  });
});
