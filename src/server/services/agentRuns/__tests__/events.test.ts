/**
 * The run event log (ADR-0067, Agent PRD D5): seq is monotonic per run, every
 * append is a heartbeat, and a tool_call bumps the live tool count.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { appendRunEvent } from "../events";

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
