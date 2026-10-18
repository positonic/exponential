/**
 * Assignment starts an Agent run (ADR-0067, Agent PRD D3): one QUEUED row per
 * agent principal, none for humans, none while a live run exists, none on a
 * parked or finished action. Mocked Prisma — no DB.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";
import { enqueueAgentRunsForAssignees, cancelQueuedRunsForUnassigned, resumeWaitingRunsOnReply } from "../enqueue";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

const ACTION = "action-1";
const SHADOW = "shadow-1";
const AGENT = "agent-1";

describe("enqueueAgentRunsForAssignees", () => {
  beforeEach(() => {
    mockReset(db);
    db.externalAgent.findMany.mockResolvedValue([{ id: AGENT, executor: "MASTRA" }] as never);
    db.action.findUnique.mockResolvedValue({ status: "ACTIVE", kanbanStatus: "TODO" } as never);
    db.agentRun.findMany.mockResolvedValue([] as never);
    db.agentRun.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-1", agentId: args.data.agentId, executor: args.data.executor })) as never);
  });

  it("creates exactly one QUEUED run for an agent assignee, requested by the caller", async () => {
    const runs = await enqueueAgentRunsForAssignees(db, {
      actionId: ACTION,
      userIds: ["human-1", SHADOW],
      requestedById: "human-1",
    });
    expect(runs).toEqual([{ id: "run-1", agentId: AGENT, executor: "MASTRA" }]);
    expect(db.agentRun.create).toHaveBeenCalledTimes(1);
    expect(db.agentRun.create.mock.calls[0]?.[0]).toMatchObject({
      data: { actionId: ACTION, agentId: AGENT, requestedById: "human-1", executor: "MASTRA" },
    });
  });

  it("only an Assistant's principal gets a run — plain External agents keep picking actions up themselves", async () => {
    await enqueueAgentRunsForAssignees(db, { actionId: ACTION, userIds: [SHADOW], requestedById: "human-1" });
    expect(db.externalAgent.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { shadowUserId: { in: [SHADOW] }, assistant: { is: { retiredAt: null } } },
    });
  });

  it("creates nothing when no assignee is an agent principal", async () => {
    db.externalAgent.findMany.mockResolvedValue([] as never);
    const runs = await enqueueAgentRunsForAssignees(db, {
      actionId: ACTION,
      userIds: ["human-1"],
      requestedById: "human-1",
    });
    expect(runs).toEqual([]);
    expect(db.agentRun.create).not.toHaveBeenCalled();
  });

  it("coalesces: no second run while one is live for the same (action, agent)", async () => {
    db.agentRun.findMany.mockResolvedValue([{ agentId: AGENT }] as never);
    const runs = await enqueueAgentRunsForAssignees(db, {
      actionId: ACTION,
      userIds: [SHADOW],
      requestedById: "human-1",
    });
    expect(runs).toEqual([]);
    expect(db.agentRun.create).not.toHaveBeenCalled();
    // The live check names the live set, not just RUNNING.
    expect(db.agentRun.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
    });
  });

  it("treats a unique-index collision on insert as coalescing (the race the read cannot see)", async () => {
    db.agentRun.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }) as never,
    );
    const runs = await enqueueAgentRunsForAssignees(db, { actionId: ACTION, userIds: [SHADOW], requestedById: "human-1" });
    expect(runs).toEqual([]);
  });

  it("propagates any other insert error", async () => {
    db.agentRun.create.mockRejectedValue(new Error("db down") as never);
    await expect(
      enqueueAgentRunsForAssignees(db, { actionId: ACTION, userIds: [SHADOW], requestedById: "human-1" }),
    ).rejects.toThrow("db down");
  });

  it.each([
    ["BACKLOG", "ACTIVE"],
    ["DONE", "ACTIVE"],
    ["TODO", "COMPLETED"],
  ])("starts nothing on a parked or finished action (kanban %s, status %s)", async (kanban, status) => {
    db.action.findUnique.mockResolvedValue({ status, kanbanStatus: kanban } as never);
    const runs = await enqueueAgentRunsForAssignees(db, {
      actionId: ACTION,
      userIds: [SHADOW],
      requestedById: "human-1",
    });
    expect(runs).toEqual([]);
    expect(db.agentRun.create).not.toHaveBeenCalled();
  });
});

describe("cancelQueuedRunsForUnassigned", () => {
  beforeEach(() => {
    mockReset(db);
    db.externalAgent.findMany.mockResolvedValue([{ id: AGENT }] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("cancels only QUEUED runs of the unassigned agent; a RUNNING one finishes", async () => {
    const n = await cancelQueuedRunsForUnassigned(db, { actionId: ACTION, userIds: [SHADOW] });
    expect(n).toBe(1);
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { actionId: ACTION, agentId: { in: [AGENT] }, status: "QUEUED" },
      data: { status: "CANCELLED" },
    });
  });
});

describe("resumeWaitingRunsOnReply", () => {
  beforeEach(() => {
    mockReset(db);
    // A waiting run by AGENT exists that the author was asked or owns.
    db.agentRun.findMany.mockResolvedValue([{ agentId: AGENT }] as never);
    db.externalAgent.findMany.mockResolvedValue([{ id: AGENT, ownerId: "owner-1", executor: "MASTRA" }] as never);
    db.agentRun.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-2", agentId: args.data.agentId, executor: args.data.executor })) as never);
  });

  it("finds waiting runs the author was asked (as requester) or owns, and nothing else", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "WAITING_ON_OWNER", requestedById: null } as never);
    await resumeWaitingRunsOnReply(db, { actionId: ACTION, authorId: "owner-1", commentId: "c-9" });
    expect(db.agentRun.findMany.mock.calls[0]?.[0]).toEqual({
      where: {
        actionId: ACTION,
        status: "WAITING_ON_OWNER",
        agent: { assistant: { is: { retiredAt: null } } },
        OR: [{ requestedById: "owner-1" }, { agent: { ownerId: "owner-1" } }],
      },
      select: { agentId: true },
    });
  });

  it("the owner's reply on an action whose latest run is WAITING_ON_OWNER starts a resume run", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "WAITING_ON_OWNER", requestedById: null } as never);
    const runs = await resumeWaitingRunsOnReply(db, { actionId: ACTION, authorId: "owner-1", commentId: "c-9" });
    expect(runs).toEqual([{ id: "run-2", agentId: AGENT, executor: "MASTRA" }]);
    expect(db.agentRun.create.mock.calls[0]?.[0]).toMatchObject({
      data: { actionId: ACTION, agentId: AGENT, requestedById: "owner-1", predecessorId: "run-1", wakeCommentId: "c-9" },
    });
  });

  it("the person who assigned it — the one the run asked — resumes it too, and stays its requester", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "WAITING_ON_OWNER", requestedById: "assigner-1" } as never);
    const runs = await resumeWaitingRunsOnReply(db, { actionId: ACTION, authorId: "assigner-1", commentId: "c-9" });
    expect(runs).toHaveLength(1);
    expect(db.agentRun.create.mock.calls[0]?.[0]).toMatchObject({
      data: { requestedById: "assigner-1", predecessorId: "run-1", wakeCommentId: "c-9" },
    });
  });

  it("the owner answering a question the run asked someone else still resumes it, keeping that requester", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "WAITING_ON_OWNER", requestedById: "assigner-1" } as never);
    await resumeWaitingRunsOnReply(db, { actionId: ACTION, authorId: "owner-1", commentId: "c-9" });
    expect(db.agentRun.create.mock.calls[0]?.[0]).toMatchObject({ data: { requestedById: "assigner-1" } });
  });

  it("a bystander resumes nothing, even if an earlier waiting run once asked them", async () => {
    // An earlier run asked the bystander; the latest waiting one asked someone else.
    db.agentRun.findFirst.mockResolvedValue({ id: "run-3", status: "WAITING_ON_OWNER", requestedById: "assigner-1" } as never);
    expect(await resumeWaitingRunsOnReply(db, { actionId: ACTION, authorId: "bystander", commentId: "c" })).toEqual([]);
    expect(db.agentRun.create).not.toHaveBeenCalled();
  });

  it("does nothing when the latest run is not waiting (finished, live, or none)", async () => {
    for (const latest of [{ id: "run-1", status: "SUCCEEDED" }, { id: "run-1", status: "RUNNING" }, null]) {
      db.agentRun.findFirst.mockResolvedValue(latest as never);
      expect(await resumeWaitingRunsOnReply(db, { actionId: ACTION, authorId: "owner-1", commentId: "c" })).toEqual([]);
    }
    expect(db.agentRun.create).not.toHaveBeenCalled();
  });

  it("a commenter with no waiting run to answer never resumes anything", async () => {
    db.agentRun.findMany.mockResolvedValue([] as never);
    expect(await resumeWaitingRunsOnReply(db, { actionId: ACTION, authorId: "teammate", commentId: "c" })).toEqual([]);
    expect(db.externalAgent.findMany).not.toHaveBeenCalled();
    expect(db.agentRun.findFirst).not.toHaveBeenCalled();
  });
});

describe("a retired Assistant is never run-eligible (ADR-0072)", () => {
  const db = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
    db.externalAgent.findMany.mockResolvedValue([] as never);
  });

  it("assignment filters on a non-retired Assistant, not merely an Assistant", async () => {
    await enqueueAgentRunsForAssignees(db, { actionId: "action-1", userIds: ["shadow-1"], requestedById: "human-1" });

    const where = db.externalAgent.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({ shadowUserId: { in: ["shadow-1"] }, assistant: { is: { retiredAt: null } } });
    expect(db.agentRun.create).not.toHaveBeenCalled();
  });

  it("a reply resumes only non-retired Assistants' waiting runs", async () => {
    db.agentRun.findMany.mockResolvedValue([] as never);
    await resumeWaitingRunsOnReply(db, { actionId: "action-1", authorId: "owner-1", commentId: "c-1" });

    expect(db.agentRun.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      agent: { assistant: { is: { retiredAt: null } } },
    });
    expect(db.agentRun.create).not.toHaveBeenCalled();
  });
});
