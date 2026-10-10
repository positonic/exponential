/**
 * The run event log (ADR-0067, Agent PRD D5): seq is monotonic per run, every
 * append is a heartbeat, and a tool_call bumps the live tool count.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { appendRunEvent, appendRunEvents } from "../events";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

describe("appendRunEvent", () => {
  beforeEach(() => {
    mockReset(db);
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.agentRunEvent.create.mockImplementation(((args: { data: { seq: number } }) =>
      Promise.resolve({ id: "ev", seq: args.data.seq })) as never);
    db.agentRun.update.mockResolvedValue({} as never);
  });

  it("assigns the next seq after the current max, inside the transaction", async () => {
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 4 } } as never);
    const ev = await appendRunEvent(db, { runId: "run-1", kind: "text", payload: { text: "hi" } });
    expect(ev.seq).toBe(5);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { runId: "run-1", seq: 5, kind: "text", payload: { text: "hi" } },
    });
  });

  it("starts at 1 for a run with no events", async () => {
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: null } } as never);
    const ev = await appendRunEvent(db, { runId: "run-1", kind: "status", payload: { status: "RUNNING" } });
    expect(ev.seq).toBe(1);
  });

  it("a tool_call is a heartbeat and bumps toolCallCount; a text event only heartbeats", async () => {
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 0 } } as never);
    await appendRunEvent(db, { runId: "run-1", kind: "tool_call", payload: { tool: "comment-on-action" } });
    expect(db.agentRun.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "run-1" },
      data: { lastEventAt: expect.any(Date), toolCallCount: { increment: 1 } },
    });
    await appendRunEvent(db, { runId: "run-1", kind: "text", payload: { text: "x" } });
    const second = db.agentRun.update.mock.calls[1]?.[0] as { data: Record<string, unknown> };
    expect(second.data).not.toHaveProperty("toolCallCount");
    expect(second.data.lastEventAt).toBeInstanceOf(Date);
  });
});

describe("appendRunEvents (local runner batches)", () => {
  beforeEach(() => {
    mockReset(db);
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.agentRunEvent.createMany.mockImplementation(((args: { data: unknown[] }) =>
      Promise.resolve({ count: args.data.length })) as never);
    db.agentRun.update.mockResolvedValue({} as never);
  });

  it("skips seqs already stored and bumps toolCallCount only by the new tool_calls", async () => {
    db.agentRunEvent.findMany.mockResolvedValue([{ seq: 1 }, { seq: 2 }] as never);
    const result = await appendRunEvents(db, {
      runId: "run-1",
      events: [
        { seq: 1, kind: "tool_call", payload: { tool: "a" } },
        { seq: 2, kind: "text", payload: { text: "x" } },
        { seq: 3, kind: "tool_call", payload: { tool: "b" } },
        { seq: 4, kind: "tool_result", payload: { ok: true } },
      ],
    });
    expect(result).toEqual({ inserted: 2, newToolCalls: 1 });
    expect(db.agentRunEvent.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [{ runId: "run-1", seq: 3 }, { runId: "run-1", seq: 4 }],
      skipDuplicates: true,
    });
    expect(db.agentRun.update.mock.calls[0]?.[0]).toMatchObject({
      data: { lastEventAt: expect.any(Date), toolCallCount: { increment: 1 } },
    });
  });

  it("a fully replayed batch inserts nothing and leaves toolCallCount alone, but still heartbeats", async () => {
    db.agentRunEvent.findMany.mockResolvedValue([{ seq: 7 }] as never);
    const result = await appendRunEvents(db, {
      runId: "run-1",
      events: [{ seq: 7, kind: "tool_call", payload: { tool: "a" } }],
    });
    expect(result).toEqual({ inserted: 0, newToolCalls: 0 });
    expect(db.agentRunEvent.createMany).not.toHaveBeenCalled();
    const data = (db.agentRun.update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("toolCallCount");
    expect(data.lastEventAt).toBeInstanceOf(Date);
  });

  it("an empty batch is just a heartbeat", async () => {
    const result = await appendRunEvents(db, { runId: "run-1", events: [] });
    expect(result).toEqual({ inserted: 0, newToolCalls: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.agentRun.update).toHaveBeenCalledTimes(1);
  });
});
