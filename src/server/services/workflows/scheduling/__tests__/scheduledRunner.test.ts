import { describe, it, expect, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { type PrismaClient } from "@prisma/client";

import { runDueScheduledAutomations } from "../scheduledRunner";

const now = new Date("2026-06-20T08:05:00Z");
const dailyAt8 = { schedule: { kind: "daily", hour: 8 } };

function row(id: string, over: Record<string, unknown> = {}) {
  return { id, config: dailyAt8, lastRunAt: null, ...over };
}

describe("runDueScheduledAutomations", () => {
  it("claims and executes a due definition", async () => {
    const db = mockDeep<PrismaClient>();
    db.workflowDefinition.findMany.mockResolvedValue([row("d1")] as never);
    db.workflowDefinition.updateMany.mockResolvedValue({ count: 1 } as never);
    const execute = vi.fn().mockResolvedValue(undefined);

    const res = await runDueScheduledAutomations(db, now, execute);

    expect(execute).toHaveBeenCalledWith("d1", {
      scheduledFor: "2026-06-20T08:00:00.000Z",
    });
    expect(res.ran).toEqual(["d1"]);
    expect(res.due).toBe(1);
  });

  it("skips (no execute) when the period was already claimed by a concurrent sweep", async () => {
    const db = mockDeep<PrismaClient>();
    db.workflowDefinition.findMany.mockResolvedValue([row("d1")] as never);
    db.workflowDefinition.updateMany.mockResolvedValue({ count: 0 } as never);
    const execute = vi.fn();

    const res = await runDueScheduledAutomations(db, now, execute);

    expect(execute).not.toHaveBeenCalled();
    expect(res.skipped).toEqual(["d1"]);
    expect(res.ran).toEqual([]);
  });

  it("skips a definition with a malformed cadence without throwing", async () => {
    const db = mockDeep<PrismaClient>();
    db.workflowDefinition.findMany.mockResolvedValue([
      { id: "bad", config: { schedule: { kind: "daily" } }, lastRunAt: null },
    ] as never);
    const execute = vi.fn();

    const res = await runDueScheduledAutomations(db, now, execute);

    expect(execute).not.toHaveBeenCalled();
    expect(res.skipped).toEqual(["bad"]);
    expect(db.workflowDefinition.updateMany).not.toHaveBeenCalled();
  });

  it("does not execute a definition that is not yet due (before its hour)", async () => {
    const db = mockDeep<PrismaClient>();
    db.workflowDefinition.findMany.mockResolvedValue([
      row("late", { config: { schedule: { kind: "daily", hour: 23 } } }),
    ] as never);
    const execute = vi.fn();

    const res = await runDueScheduledAutomations(db, now, execute);

    expect(execute).not.toHaveBeenCalled();
    expect(res.due).toBe(0);
  });

  it("isolates a per-definition execution failure and continues", async () => {
    const db = mockDeep<PrismaClient>();
    db.workflowDefinition.findMany.mockResolvedValue([
      row("d1"),
      row("d2"),
    ] as never);
    db.workflowDefinition.updateMany.mockResolvedValue({ count: 1 } as never);
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    const res = await runDueScheduledAutomations(db, now, execute);

    expect(res.ran).toEqual(["d2"]);
    expect(res.failed).toEqual([{ id: "d1", error: "boom" }]);
  });
});
