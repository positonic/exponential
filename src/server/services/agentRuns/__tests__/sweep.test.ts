/**
 * The minute sweep (ADR-0067, Agent PRD D4): stale RUNNING rows time out
 * (heartbeat, else startedAt, older than five minutes) with a status event;
 * QUEUED rows are retried only once older than a minute.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// The finish hook (notification, activity, time entry) is covered by finish.test.ts.
const finishMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../finish", () => ({ onRunFinished: (...args: unknown[]) => finishMock(...args) }));

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.MASTRA_API_URL = "http://mastra.test:4111";
});

const { sweepAgentRuns } = await import("../sweep");

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const NOW = new Date("2026-10-10T12:00:00Z");

describe("sweepAgentRuns", () => {
  beforeEach(() => {
    mockReset(db);
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 3 } } as never);
    db.agentRunEvent.create.mockResolvedValue({ id: "ev", seq: 4 } as never);
    db.agentRun.update.mockResolvedValue({} as never);
    // findMany is called twice: stale RUNNING rows, then QUEUED rows to dispatch.
    db.agentRun.findMany.mockResolvedValueOnce([{ id: "stale-1" }] as never).mockResolvedValueOnce([] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("times out RUNNING rows with no heartbeat for five minutes, guarded on status, with a status event", async () => {
    const result = await sweepAgentRuns(db, NOW);

    expect(result.timedOut).toEqual(["stale-1"]);
    const staleWhere = (db.agentRun.findMany.mock.calls[0]?.[0] as { where: { status: string; OR: unknown[] } }).where;
    expect(staleWhere.status).toBe("RUNNING");
    const cutoff = new Date(NOW.getTime() - 5 * 60 * 1000);
    expect(staleWhere.OR).toEqual([
      { lastEventAt: { lt: cutoff } },
      { lastEventAt: null, startedAt: { lt: cutoff } },
    ]);
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "stale-1", status: "RUNNING" },
      data: { status: "TIMED_OUT", finishedAt: NOW },
    });
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { runId: "stale-1", kind: "status", payload: { status: "TIMED_OUT" } },
    });
  });

  it("does not record a timeout for a run that finished between the read and the write", async () => {
    db.agentRun.updateMany.mockResolvedValue({ count: 0 } as never);
    const result = await sweepAgentRuns(db, NOW);
    expect(result.timedOut).toEqual([]);
    expect(db.agentRunEvent.create).not.toHaveBeenCalled();
  });

  it("retries only QUEUED rows older than a minute", async () => {
    await sweepAgentRuns(db, NOW);
    const queuedWhere = (db.agentRun.findMany.mock.calls[1]?.[0] as { where: Record<string, unknown> }).where;
    expect(queuedWhere).toMatchObject({
      status: "QUEUED",
      executor: "MASTRA",
      createdAt: { lt: new Date(NOW.getTime() - 60 * 1000) },
    });
  });
});

describe("sweep → finish hook", () => {
  it("runs the finish hook for each timed-out run", async () => {
    mockReset(db);
    finishMock.mockClear();
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 0 } } as never);
    db.agentRunEvent.create.mockResolvedValue({ id: "ev", seq: 1 } as never);
    db.agentRun.update.mockResolvedValue({} as never);
    db.agentRun.findMany.mockResolvedValueOnce([{ id: "stale-1" }] as never).mockResolvedValueOnce([] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
    await sweepAgentRuns(db, NOW);
    expect(finishMock).toHaveBeenCalledWith(db, "stale-1");
  });
});
