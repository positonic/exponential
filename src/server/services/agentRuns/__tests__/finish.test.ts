/**
 * Finishing a run (ADR-0067, D4 step 5 / D8 / D9): one agent_run
 * notification from the shadow user, an activity event, and an Agent-run
 * Time entry owned by the owner and authored by the Assistant — idempotent
 * on sourceRef, skipped for a cancelled queue entry, never for a live run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const emitMock = vi.fn().mockResolvedValue(undefined);
vi.mock("~/server/services/notifications/emit/emitNotification", () => ({
  emitNotification: (...args: unknown[]) => emitMock(...args),
}));
const activityMock = vi.fn().mockResolvedValue(true);
vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: (...args: unknown[]) => activityMock(...args),
}));

const { onRunFinished } = await import("../finish");

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const started = new Date("2026-10-10T10:00:00Z");
const finished = new Date("2026-10-10T10:02:30Z");
const base = {
  id: "run-1",
  actionId: "action-1",
  startedAt: started,
  finishedAt: finished,
  summary: "Found two venues.\nDetails below.",
  agent: { id: "agent-1", ownerId: "owner-1", shadowUserId: "shadow-1" },
  action: { workspaceId: "ws-1", project: null },
};

describe("onRunFinished", () => {
  beforeEach(() => {
    mockReset(db);
    emitMock.mockClear();
    activityMock.mockClear();
    db.timeEntry.upsert.mockResolvedValue({} as never);
  });

  it("SUCCEEDED: notifies as the shadow user, records activity, and writes a PROPOSED agent-run time entry for the owner", async () => {
    db.agentRun.findUnique.mockResolvedValue({ ...base, status: "SUCCEEDED" } as never);

    await onRunFinished(db, "run-1");

    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({
      category: "agent_run",
      actorUserId: "shadow-1",
      subject: { runId: "run-1", actionId: "action-1", outcome: "finished" },
    }));
    expect(activityMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      workspaceId: "ws-1", userId: "shadow-1", entityType: "agent_run", entityId: "run-1", action: "completed",
    }));
    expect(db.timeEntry.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { userId_sourceRef: { userId: "owner-1", sourceRef: "agent-run:run-1" } },
      create: {
        userId: "owner-1",
        actionId: "action-1",
        workspaceId: "ws-1",
        startedAt: started,
        endedAt: finished,
        status: "PROPOSED",
        source: "agent-run",
        createdByAgentId: "agent-1",
        note: "Found two venues.",
      },
      update: {},
    });
  });

  it("FAILED / TIMED_OUT: outcome is 'stopped' and activity is 'failed'; time is still recorded", async () => {
    db.agentRun.findUnique.mockResolvedValue({ ...base, status: "TIMED_OUT", summary: null } as never);
    await onRunFinished(db, "run-1");
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.objectContaining({ outcome: "stopped" }) }));
    expect(activityMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "failed" }));
    expect(db.timeEntry.upsert).toHaveBeenCalledTimes(1);
  });

  it("a cancelled queue entry never ran: notification yes, time entry no", async () => {
    db.agentRun.findUnique.mockResolvedValue({ ...base, status: "CANCELLED", startedAt: null } as never);
    await onRunFinished(db, "run-1");
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(db.timeEntry.upsert).not.toHaveBeenCalled();
  });

  it("does nothing for a live or waiting run", async () => {
    for (const status of ["QUEUED", "RUNNING", "WAITING_ON_OWNER"]) {
      db.agentRun.findUnique.mockResolvedValue({ ...base, status } as never);
      await onRunFinished(db, "run-1");
    }
    expect(emitMock).not.toHaveBeenCalled();
    expect(db.timeEntry.upsert).not.toHaveBeenCalled();
  });
});
