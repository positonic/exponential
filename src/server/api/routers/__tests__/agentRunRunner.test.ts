/**
 * The local runner's surface (ADR-0067, Agent PRD V2, D2): `agentRun.claim`,
 * `heartbeat`, `appendEvents` and `finish` are callable only with an agent
 * key, resolve every run through the caller's own External agent, claim with
 * a guarded updateMany, append idempotently on seq, and finish through the
 * same hook as the hosted executor. The tracer: a curl-shaped
 * claim → appendEvents → finish, after which `listForAction` carries the
 * tool count and summary the pill renders. Mocked Prisma.
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

vi.mock("openai", () => ({ default: class { constructor(_o?: unknown) { /* noop */ } } }));
vi.mock("next-auth", () => ({ default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
const finishMock = vi.fn().mockResolvedValue(undefined);
vi.mock("~/server/services/agentRuns/finish", () => ({
  onRunFinished: (...args: unknown[]) => finishMock(...args),
}));
const mentionMock = vi.fn();
vi.mock("~/server/services/notifications/emit/mentionAdapters", () => ({
  emitActionCommentMention: (...args: unknown[]) => mentionMock(...args),
}));
vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn().mockResolvedValue(true),
}));
vi.mock("~/server/services/access", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getActionAccess: vi.fn().mockResolvedValue({ canView: true }),
  canViewAction: () => true,
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
const AGENT = { id: "agent-1", ownerId: "owner-1", shadowUserId: SHADOW, executor: "LOCAL_CLI" };
const RUN = "run-1";
const ACTION = "action-1";
const RUNNER = "james-mbp";

const briefRow = {
  id: RUN,
  actionId: ACTION,
  predecessorId: null,
  wakeCommentId: null,
  action: {
    id: ACTION,
    name: "Find a venue",
    description: "Somewhere central",
    dueDate: null,
    workspaceId: "ws-1",
    projectId: "proj-1",
    project: { name: "Offsite" },
  },
  agent: {
    id: AGENT.id,
    name: "Aria",
    shadowUser: { id: SHADOW, email: null, name: "Aria", image: null },
    owner: { id: "owner-1", name: "James" },
    assistant: { name: "Aria", emoji: "✨", personality: "Warm.", instructions: null, userContext: null },
  },
  requestedBy: { name: "James" },
  predecessor: null,
};

function runner(db: DeepMockProxy<PrismaClient>, overrides: { tokenType?: string; userId?: string } = {}) {
  return createMockCaller({
    userId: overrides.userId ?? SHADOW,
    db,
    tokenType: "tokenType" in overrides ? overrides.tokenType : "agent-key",
  });
}

let db: DeepMockProxy<PrismaClient>;
beforeEach(() => {
  db = getDbMock();
  mockReset(db);
  finishMock.mockClear();
  mentionMock.mockReset();
  db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
  db.externalAgent.findUnique.mockResolvedValue(AGENT as never);
  db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 0 } } as never);
  db.agentRunEvent.create.mockResolvedValue({ id: "ev", seq: 1 } as never);
  db.agentRunEvent.findMany.mockResolvedValue([] as never);
  db.agentRunEvent.createMany.mockImplementation(((args: { data: unknown[] }) =>
    Promise.resolve({ count: args.data.length })) as never);
  db.agentRun.update.mockResolvedValue({} as never);
  db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
});

describe("runner guard", () => {
  it("refuses a web session and an agent-context run token alike", async () => {
    await expect(runner(db, { tokenType: undefined }).agentRun.claim({ runnerId: RUNNER }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(runner(db, { tokenType: "agent-context" }).agentRun.heartbeat({ runId: RUN }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.agentRun.updateMany).not.toHaveBeenCalled();
  });

  it("is NOT_FOUND when the key's shadow user has no External agent", async () => {
    db.externalAgent.findUnique.mockResolvedValue(null as never);
    await expect(runner(db).agentRun.claim({ runnerId: RUNNER })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.externalAgent.findUnique.mock.calls[0]?.[0]).toMatchObject({ where: { shadowUserId: SHADOW } });
  });
});

describe("agentRun.claim", () => {
  it("returns null when the agent has nothing queued", async () => {
    db.agentRun.findFirst.mockResolvedValue(null as never);
    expect(await runner(db).agentRun.claim({ runnerId: RUNNER })).toBeNull();
    // Only this agent's LOCAL_CLI queue is ever looked at.
    expect(db.agentRun.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { agentId: AGENT.id, status: "QUEUED", executor: "LOCAL_CLI" },
      orderBy: { createdAt: "asc" },
    });
    expect(db.agentRun.updateMany).not.toHaveBeenCalled();
  });

  it("claims the oldest QUEUED run atomically and returns the hosted brief", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN } as never);
    db.agentRun.findUniqueOrThrow.mockResolvedValue(briefRow as never);

    const claimed = await runner(db).agentRun.claim({ runnerId: RUNNER });

    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: RUN, status: "QUEUED" },
      data: { status: "RUNNING", claimedBy: RUNNER, startedAt: expect.any(Date), lastEventAt: expect.any(Date) },
    });
    expect(claimed).toMatchObject({ id: RUN, actionId: ACTION, claimedBy: RUNNER, owner: { id: "owner-1" } });
    expect(claimed?.messages[0]).toMatchObject({ role: "system", content: expect.stringContaining("Name: Aria ✨") });
    expect(claimed?.messages[1]?.content).toContain('assigned the action "Find a venue"');
    expect(claimed?.messages[1]?.content).not.toContain("get-run-context");
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { runId: RUN, kind: "status", payload: { status: "RUNNING", claimedBy: RUNNER } },
    });
  });

  it("a second runner racing for the same row gets nothing", async () => {
    db.agentRun.findFirst.mockResolvedValueOnce({ id: RUN } as never).mockResolvedValue(null as never);
    db.agentRun.findUniqueOrThrow.mockResolvedValue(briefRow as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 0 } as never);
    expect(await runner(db).agentRun.claim({ runnerId: "other" })).toBeNull();
    expect(db.agentRunEvent.create).not.toHaveBeenCalled();
  });

  it("a brief that cannot be built leaves the run QUEUED — the guarded write never happens", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN } as never);
    db.agentRun.findUniqueOrThrow.mockRejectedValue(new Error("action gone"));
    await expect(runner(db).agentRun.claim({ runnerId: RUNNER })).rejects.toThrow("action gone");
    expect(db.agentRun.updateMany).not.toHaveBeenCalled();
  });

  it("a status event that fails after the claim hands the row back to the queue", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN } as never);
    db.agentRun.findUniqueOrThrow.mockResolvedValue(briefRow as never);
    db.agentRunEvent.create.mockRejectedValue(new Error("db down"));
    await expect(runner(db).agentRun.claim({ runnerId: RUNNER })).rejects.toThrow("db down");
    expect(db.agentRun.updateMany.mock.calls[1]?.[0]).toMatchObject({
      where: { id: RUN, status: "RUNNING", claimedBy: RUNNER },
      data: { status: "QUEUED", claimedBy: null, startedAt: null },
    });
  });
});

describe("agentRun.heartbeat / appendEvents / finish resolve the run through the caller's agent", () => {
  it("NOT_FOUND for a run of another agent, PRECONDITION_FAILED once it is not RUNNING", async () => {
    db.agentRun.findFirst.mockResolvedValueOnce(null as never);
    await expect(runner(db).agentRun.heartbeat({ runId: "theirs" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.agentRun.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: "theirs", agentId: AGENT.id } });

    db.agentRun.findFirst.mockResolvedValueOnce({ id: RUN, status: "CANCELLED", actionId: ACTION, claimedBy: RUNNER, toolCallCount: 0 } as never);
    await expect(runner(db).agentRun.heartbeat({ runId: RUN })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.agentRun.updateMany).not.toHaveBeenCalled();
  });

  it("a run claimed by another runner is FORBIDDEN to this one", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN, status: "RUNNING", actionId: ACTION, claimedBy: "other", toolCallCount: 0 } as never);
    await expect(runner(db).agentRun.heartbeat({ runId: RUN, runnerId: RUNNER })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("heartbeat touches lastEventAt, guarded on RUNNING", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN, status: "RUNNING", actionId: ACTION, claimedBy: RUNNER, toolCallCount: 0 } as never);
    const result = await runner(db).agentRun.heartbeat({ runId: RUN, runnerId: RUNNER });
    expect(result.ok).toBe(true);
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: RUN, status: "RUNNING" },
      data: { lastEventAt: expect.any(Date) },
    });
  });

  it("heartbeat reports ok: false when the run left RUNNING between the read and the write", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN, status: "RUNNING", actionId: ACTION, claimedBy: RUNNER, toolCallCount: 0 } as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 0 } as never);
    const result = await runner(db).agentRun.heartbeat({ runId: RUN, runnerId: RUNNER });
    expect(result.ok).toBe(false);
  });

  it("appendEvents is idempotent on seq and counts only new tool_calls", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN, status: "RUNNING", actionId: ACTION, claimedBy: RUNNER, toolCallCount: 2 } as never);
    db.agentRunEvent.findMany.mockResolvedValue([{ seq: 3 }] as never);

    const result = await runner(db).agentRun.appendEvents({
      runId: RUN,
      events: [
        { seq: 3, kind: "tool_call", payload: { tool: "search" } }, // replayed
        { seq: 4, kind: "tool_call", payload: { tool: "comment-on-action" } },
        { seq: 5, kind: "text", payload: { text: "Found three venues" } },
      ],
    });

    expect(result).toEqual({ inserted: 2, newToolCalls: 1, toolCallCount: 3 });
    expect(db.agentRunEvent.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [
        { runId: RUN, seq: 4, kind: "tool_call" },
        { runId: RUN, seq: 5, kind: "text" },
      ],
      skipDuplicates: true,
    });
    expect(db.agentRun.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: RUN },
      data: { lastEventAt: expect.any(Date), toolCallCount: { increment: 1 } },
    });
  });

  it("finish SUCCEEDED: guarded write from RUNNING, status event, finish hook", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN, status: "RUNNING", actionId: ACTION, claimedBy: RUNNER, toolCallCount: 3 } as never);
    const result = await runner(db).agentRun.finish({
      runId: RUN,
      status: "SUCCEEDED",
      summary: "Booked the Barbican for 19 Nov.",
      readyToClose: true,
      usage: { inputTokens: 1200 },
    });
    expect(result).toEqual({ finished: true, status: "SUCCEEDED" });
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: RUN, status: "RUNNING" },
      data: { status: "SUCCEEDED", summary: "Booked the Barbican for 19 Nov.", readyToClose: true, finishedAt: expect.any(Date) },
    });
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({ data: { kind: "status", payload: { status: "SUCCEEDED" } } });
    expect(finishMock).toHaveBeenCalledWith(expect.anything(), RUN);
  });

  it("finish FAILED after a cancel landed: nothing matched, so no finish hook (the cancel ran it)", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN, status: "RUNNING", actionId: ACTION, claimedBy: RUNNER, toolCallCount: 0 } as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 0 } as never);
    const result = await runner(db).agentRun.finish({ runId: RUN, status: "FAILED", error: "model quota" });
    expect(result).toEqual({ finished: false, status: "FAILED" });
    expect(finishMock).not.toHaveBeenCalled();
    expect(db.agentRunEvent.create).not.toHaveBeenCalled();
  });

  it("finish WAITING_ON_OWNER posts the mention comment like ask-owner and parks the row without the finish hook", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN, status: "RUNNING", actionId: ACTION, claimedBy: RUNNER, toolCallCount: 1 } as never);
    db.user.findUniqueOrThrow.mockResolvedValue({ id: "owner-1", name: "James [Ops]" } as never);
    db.actionComment.create.mockResolvedValue({ id: "c1", author: { id: SHADOW, name: "Aria", image: null } } as never);
    db.action.findUnique.mockResolvedValue({ workspaceId: "ws-1", project: null } as never);

    const result = await runner(db).agentRun.finish({ runId: RUN, status: "WAITING_ON_OWNER", question: "12 or 19 Nov?" });

    expect(db.actionComment.create.mock.calls[0]?.[0]).toMatchObject({
      data: { actionId: ACTION, authorId: SHADOW, content: "@[James Ops](owner-1) 12 or 19 Nov?" },
    });
    expect(mentionMock).toHaveBeenCalledTimes(1);
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { kind: "tool_call", payload: { tool: "ask-owner", commentId: "c1" } },
    });
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: RUN, status: "RUNNING" },
      data: { status: "WAITING_ON_OWNER" },
    });
    expect(result).toEqual({ finished: true, status: "WAITING_ON_OWNER", commentId: "c1" });
    expect(finishMock).not.toHaveBeenCalled();
    // The guarded status write comes first: nothing is posted for a run that was cancelled meanwhile.
    expect(db.agentRun.updateMany.mock.invocationCallOrder[0]).toBeLessThan(db.actionComment.create.mock.invocationCallOrder[0]!);
  });

  it("finish WAITING_ON_OWNER after a cancel landed posts no mention and no transcript entry", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: RUN, status: "RUNNING", actionId: ACTION, claimedBy: RUNNER, toolCallCount: 1 } as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 0 } as never);
    const result = await runner(db).agentRun.finish({ runId: RUN, status: "WAITING_ON_OWNER", question: "12 or 19 Nov?" });
    expect(result).toEqual({ finished: false, status: "WAITING_ON_OWNER", commentId: null });
    expect(db.actionComment.create).not.toHaveBeenCalled();
    expect(db.agentRunEvent.create).not.toHaveBeenCalled();
    expect(mentionMock).not.toHaveBeenCalled();
  });

  it("WAITING_ON_OWNER without a question is rejected before any write", async () => {
    await expect(runner(db).agentRun.finish({ runId: RUN, status: "WAITING_ON_OWNER" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.agentRun.updateMany).not.toHaveBeenCalled();
  });
});

describe("tracer: claim → appendEvents → finish, then the pill reads the result", () => {
  it("drives the state machine with an agent key and listForAction shows toolCallCount + summary", async () => {
    // A tiny in-memory row so each step sees the previous step's writes.
    const row: Record<string, unknown> = {
      id: RUN, actionId: ACTION, agentId: AGENT.id, status: "QUEUED", executor: "LOCAL_CLI",
      claimedBy: null, startedAt: null, finishedAt: null, lastEventAt: null, createdAt: new Date(),
      toolCallCount: 0, summary: null, readyToClose: false, error: null, requestedById: "owner-1",
      agent: { id: AGENT.id, name: "Aria", ownerId: "owner-1", shadowUser: { id: SHADOW, name: "Aria", image: null }, assistant: { emoji: "✨" } },
    };
    const apply = (data: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(data)) {
        row[k] = typeof v === "object" && v !== null && "increment" in v ? (row[k] as number) + (v as { increment: number }).increment : v;
      }
    };
    db.agentRun.findFirst.mockImplementation((() => Promise.resolve({ ...row })) as never);
    db.agentRun.findUniqueOrThrow.mockResolvedValue(briefRow as never);
    db.agentRun.updateMany.mockImplementation(((args: { where: { status?: string }; data: Record<string, unknown> }) => {
      if (args.where.status && args.where.status !== row.status) return Promise.resolve({ count: 0 });
      apply(args.data);
      return Promise.resolve({ count: 1 });
    }) as never);
    db.agentRun.update.mockImplementation(((args: { data: Record<string, unknown> }) => {
      apply(args.data);
      return Promise.resolve({ ...row });
    }) as never);
    db.agentRun.findMany.mockImplementation((() => Promise.resolve([{ ...row }])) as never);

    const key = runner(db);
    const claimed = await key.agentRun.claim({ runnerId: RUNNER });
    expect(claimed?.id).toBe(RUN);
    expect(row.status).toBe("RUNNING");

    await key.agentRun.appendEvents({
      runId: RUN,
      runnerId: RUNNER,
      events: [
        { seq: 1, kind: "tool_call", payload: { tool: "search" } },
        { seq: 2, kind: "tool_call", payload: { tool: "comment-on-action" } },
      ],
    });
    expect(row.toolCallCount).toBe(2);

    await key.agentRun.finish({ runId: RUN, runnerId: RUNNER, status: "SUCCEEDED", summary: "Done.", readyToClose: true });
    expect(row.status).toBe("SUCCEEDED");
    expect(finishMock).toHaveBeenCalledTimes(1);

    // A second claim finds nothing: the run left the queue.
    db.agentRun.findFirst.mockResolvedValueOnce(null as never);
    expect(await key.agentRun.claim({ runnerId: RUNNER })).toBeNull();

    // The owner opens the action: the pill's fields are there.
    const runs = await createMockCaller({ userId: "owner-1", db }).agentRun.listForAction({ actionId: ACTION });
    expect(runs[0]).toMatchObject({ id: RUN, status: "SUCCEEDED", toolCallCount: 2, summary: "Done.", readyToClose: true, isOwner: true });
  });
});
