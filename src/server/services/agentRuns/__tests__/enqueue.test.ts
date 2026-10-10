/**
 * Assignment starts an Agent run (ADR-0067, Agent PRD D3): one QUEUED row per
 * agent principal, none for humans, none while a live run exists, none on a
 * parked or finished action. Mocked Prisma — no DB.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { enqueueAgentRunsForAssignees, cancelQueuedRunsForUnassigned, resumeWaitingRunsOnOwnerReply } from "../enqueue";

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
      where: { shadowUserId: { in: [SHADOW] }, assistant: { isNot: null } },
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

describe("resumeWaitingRunsOnOwnerReply", () => {
  beforeEach(() => {
    mockReset(db);
    db.externalAgent.findMany.mockResolvedValue([{ id: AGENT, executor: "MASTRA" }] as never);
    db.agentRun.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-2", agentId: args.data.agentId, executor: args.data.executor })) as never);
  });

  it("the owner's reply on an action whose latest run is WAITING_ON_OWNER starts a resume run", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "WAITING_ON_OWNER" } as never);
    const runs = await resumeWaitingRunsOnOwnerReply(db, { actionId: ACTION, authorId: "owner-1", commentId: "c-9" });
    expect(runs).toEqual([{ id: "run-2", agentId: AGENT, executor: "MASTRA" }]);
    expect(db.externalAgent.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { ownerId: "owner-1" } });
    expect(db.agentRun.create.mock.calls[0]?.[0]).toMatchObject({
      data: { actionId: ACTION, agentId: AGENT, requestedById: "owner-1", predecessorId: "run-1", wakeCommentId: "c-9" },
    });
  });

  it("does nothing when the latest run is not waiting (finished, live, or none)", async () => {
    for (const latest of [{ id: "run-1", status: "SUCCEEDED" }, { id: "run-1", status: "RUNNING" }, null]) {
      db.agentRun.findFirst.mockResolvedValue(latest as never);
      expect(await resumeWaitingRunsOnOwnerReply(db, { actionId: ACTION, authorId: "owner-1", commentId: "c" })).toEqual([]);
    }
    expect(db.agentRun.create).not.toHaveBeenCalled();
  });

  it("a commenter who owns no agent never resumes anything", async () => {
    db.externalAgent.findMany.mockResolvedValue([] as never);
    expect(await resumeWaitingRunsOnOwnerReply(db, { actionId: ACTION, authorId: "teammate", commentId: "c" })).toEqual([]);
    expect(db.agentRun.findFirst).not.toHaveBeenCalled();
  });
});
