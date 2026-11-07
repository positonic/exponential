import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { retireAssistant } from "../retire";

const OWNER_ID = "user-owner";
const NOW = new Date("2026-10-11T12:00:00Z");

const retiring = {
  id: "asst-old",
  createdById: OWNER_ID,
  retiredAt: null,
  externalAgent: { id: "agent-old", shadowUserId: "shadow-old" },
};
const survivor = {
  createdById: OWNER_ID,
  retiredAt: null,
  externalAgent: { shadowUserId: "shadow-new" },
};

describe("retireAssistant (ADR-0072)", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.assistant.findUniqueOrThrow.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === "asst-old" ? retiring : survivor)) as never);
    db.externalAgentKey.deleteMany.mockResolvedValue({ count: 2 });
    db.workspaceUser.findMany.mockImplementation(((args: { where: { userId: string } }) =>
      Promise.resolve(
        args.where.userId === "shadow-old"
          ? [
              { workspaceId: "ws-a", positionHolders: [{ positionId: "pos-cos" }] },
              { workspaceId: "ws-b", positionHolders: [] },
            ]
          : [{ id: "wu-new-a", workspaceId: "ws-a" }],
      )) as never);
    db.positionHolder.createMany.mockResolvedValue({ count: 1 });
    db.workspaceUser.createMany.mockResolvedValue({ count: 1 });
    db.workspaceUser.deleteMany.mockResolvedValue({ count: 2 });
    db.actionAssignee.findMany.mockResolvedValue([
      { id: "aa-1", actionId: "action-1" },
    ] as never);
    db.actionAssignee.createMany.mockResolvedValue({ count: 1 });
    db.actionAssignee.deleteMany.mockResolvedValue({ count: 1 });
    db.agentRun.findMany.mockResolvedValue([] as never);
  });

  it("stamps retiredAt, revokes keys and removes memberships, keeping the principal", async () => {
    const result = await retireAssistant(db, { assistantId: "asst-old", now: NOW });

    expect(db.assistant.update).toHaveBeenCalledWith({
      where: { id: "asst-old" },
      data: { retiredAt: NOW, isDefault: false },
    });
    expect(db.externalAgentKey.deleteMany).toHaveBeenCalledWith({ where: { agentId: "agent-old" } });
    expect(db.workspaceUser.deleteMany).toHaveBeenCalledWith({ where: { userId: "shadow-old" } });
    // The principal stays: deleting the External agent would cascade-delete its runs.
    expect(db.externalAgent.delete).not.toHaveBeenCalled();
    expect(db.externalAgent.deleteMany).not.toHaveBeenCalled();
    expect(db.user.delete).not.toHaveBeenCalled();
    expect(db.assistant.delete).not.toHaveBeenCalled();
    expect(db.agentRun.deleteMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ retired: true, keysRevoked: 2, membershipsRemoved: 2 });
  });

  it("without a survivor, unassigns it from open Actions only and moves nothing", async () => {
    const result = await retireAssistant(db, { assistantId: "asst-old", now: NOW });

    expect(db.actionAssignee.findMany).toHaveBeenCalledWith({
      where: { userId: "shadow-old", action: { status: { notIn: ["COMPLETED", "CANCELLED"] } } },
      select: { id: true, actionId: true },
    });
    expect(db.actionAssignee.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["aa-1"] } } });
    expect(db.workspaceUser.createMany).not.toHaveBeenCalled();
    expect(db.positionHolder.createMany).not.toHaveBeenCalled();
    expect(db.actionAssignee.createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ membershipsMoved: 0, assignmentsMoved: 0, assignmentsRemoved: 1 });
  });

  it("moves memberships, their Positions and open assignments to the survivor, starting no run", async () => {
    const result = await retireAssistant(db, {
      assistantId: "asst-old",
      survivorId: "asst-new",
      now: NOW,
    });

    expect(db.workspaceUser.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "shadow-new", workspaceId: "ws-a", role: "member" },
        { userId: "shadow-new", workspaceId: "ws-b", role: "member" },
      ],
      skipDuplicates: true,
    });
    // The Positions held through a membership move with it: a PositionHolder
    // row would otherwise cascade away with the retired membership.
    expect(db.positionHolder.createMany).toHaveBeenCalledWith({
      data: [{ positionId: "pos-cos", workspaceUserId: "wu-new-a" }],
      skipDuplicates: true,
    });
    expect(db.actionAssignee.createMany).toHaveBeenCalledWith({
      data: [{ actionId: "action-1", userId: "shadow-new" }],
      skipDuplicates: true,
    });
    expect(db.agentRun.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ membershipsMoved: 1, positionsMoved: 1, assignmentsMoved: 1 });
  });

  it("cancels its live and waiting runs, logging why, and skips one that finished meanwhile", async () => {
    db.agentRun.findMany.mockResolvedValue([
      { id: "run-q", status: "QUEUED" },
      { id: "run-w", status: "WAITING_ON_OWNER" },
      { id: "run-done", status: "RUNNING" },
    ] as never);
    db.agentRun.updateMany.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve({ count: args.where.id === "run-done" ? 0 : 1 })) as never);
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 4 } } as never);

    const result = await retireAssistant(db, { assistantId: "asst-old", now: NOW });

    expect(db.agentRun.findMany).toHaveBeenCalledWith({
      where: { agentId: "agent-old", status: { in: ["QUEUED", "RUNNING", "WAITING_ON_OWNER"] } },
      select: { id: true, status: true },
    });
    expect(db.agentRun.updateMany).toHaveBeenCalledWith({
      where: { id: "run-q", status: "QUEUED" },
      data: { status: "CANCELLED", finishedAt: NOW, lastEventAt: NOW },
    });
    expect(db.agentRunEvent.create.mock.calls.map((c) => c[0].data)).toEqual([
      {
        runId: "run-q",
        seq: 5,
        kind: "status",
        payload: { status: "CANCELLED", by: "assistant-retired", was: "QUEUED" },
      },
      {
        runId: "run-w",
        seq: 5,
        kind: "status",
        payload: { status: "CANCELLED", by: "assistant-retired", was: "WAITING_ON_OWNER" },
      },
    ]);
    expect(result.runsCancelled).toBe(2);
  });

  it("leaves an already-retired Assistant alone", async () => {
    db.assistant.findUniqueOrThrow.mockResolvedValue({ ...retiring, retiredAt: NOW } as never);

    const result = await retireAssistant(db, { assistantId: "asst-old" });

    expect(result.retired).toBe(false);
    expect(db.assistant.update).not.toHaveBeenCalled();
    expect(db.externalAgentKey.deleteMany).not.toHaveBeenCalled();
    expect(db.workspaceUser.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses a survivor that belongs to someone else, writing nothing", async () => {
    db.assistant.findUniqueOrThrow.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(
        args.where.id === "asst-old" ? retiring : { ...survivor, createdById: "someone-else" },
      )) as never);

    await expect(
      retireAssistant(db, { assistantId: "asst-old", survivorId: "asst-new" }),
    ).rejects.toThrow("same person");
    expect(db.assistant.update).not.toHaveBeenCalled();
  });

  it("refuses a retired survivor, and an Assistant surviving itself", async () => {
    db.assistant.findUniqueOrThrow.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(
        args.where.id === "asst-old" ? retiring : { ...survivor, retiredAt: NOW },
      )) as never);

    await expect(
      retireAssistant(db, { assistantId: "asst-old", survivorId: "asst-new" }),
    ).rejects.toThrow("itself retired");
    await expect(
      retireAssistant(db, { assistantId: "asst-old", survivorId: "asst-old" }),
    ).rejects.toThrow("its own retirement");
    expect(db.assistant.update).not.toHaveBeenCalled();
  });
});
