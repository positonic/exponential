/**
 * Scheduler-seam tests for the hourly ADR sweep (imitating
 * ticketSync/scheduler.test.ts): mocked Prisma, injected fake runner — no
 * network, no DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { runDueAdrSyncs, STALE_RUN_MINUTES } from "../scheduler";
import type { AdrSyncResult } from "../engine";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const NOW = new Date("2026-08-14T12:00:00Z");

function okResult(overrides?: Partial<AdrSyncResult>): AdrSyncResult {
  return {
    runId: "run-x",
    status: "success",
    created: 1,
    updated: 0,
    skipped: 2,
    deleted: 0,
    failed: 0,
    items: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  db.adrSyncRun.findFirst.mockResolvedValue(null);
  db.adrSyncRun.update.mockResolvedValue({} as never);
});

describe("runDueAdrSyncs", () => {
  it("sweeps every enabled, connected config", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg1", repositoryId: "r1" },
      { id: "cfg2", repositoryId: "r2" },
    ] as never);
    const runSync = vi.fn().mockResolvedValue(okResult());

    const result = await runDueAdrSyncs(db, NOW, { runSync });

    expect(result.swept).toBe(2);
    expect(runSync).toHaveBeenCalledTimes(2);
    expect(result.items.every((i) => i.outcome === "ran")).toBe(true);
    // The where clause is the disconnected-never-due guard.
    expect(db.adrSyncConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enabled: true, integrationId: { not: null } },
      }),
    );
  });

  it("reports an unchanged repo distinctly", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg1", repositoryId: "r1" },
    ] as never);
    const runSync = vi.fn().mockResolvedValue(okResult({ status: "unchanged" }));

    const result = await runDueAdrSyncs(db, NOW, { runSync });

    expect(result.items[0]?.outcome).toBe("unchanged");
  });

  it("skips a config whose run is still in flight", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg1", repositoryId: "r1" },
    ] as never);
    db.adrSyncRun.findFirst.mockResolvedValue({
      id: "run-live",
      startedAt: new Date(NOW.getTime() - 5 * 60_000),
    } as never);
    const runSync = vi.fn();

    const result = await runDueAdrSyncs(db, NOW, { runSync });

    expect(result.items[0]?.outcome).toBe("skipped-running");
    expect(runSync).not.toHaveBeenCalled();
  });

  it("marks a stale in-flight run as crashed and proceeds", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg1", repositoryId: "r1" },
    ] as never);
    db.adrSyncRun.findFirst.mockResolvedValue({
      id: "run-stale",
      startedAt: new Date(NOW.getTime() - (STALE_RUN_MINUTES + 1) * 60_000),
    } as never);
    const runSync = vi.fn().mockResolvedValue(okResult());

    const result = await runDueAdrSyncs(db, NOW, { runSync });

    expect(db.adrSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-stale" },
        data: expect.objectContaining({ status: "error" }),
      }),
    );
    expect(runSync).toHaveBeenCalled();
    expect(result.items[0]?.outcome).toBe("ran");
  });

  it("one config's failure never blocks the others", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg-bad", repositoryId: "r1" },
      { id: "cfg-good", repositoryId: "r2" },
    ] as never);
    const runSync = vi
      .fn()
      .mockRejectedValueOnce(new Error("octokit exploded"))
      .mockResolvedValueOnce(okResult());

    const result = await runDueAdrSyncs(db, NOW, { runSync });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      configId: "cfg-bad",
      outcome: "error",
      detail: expect.stringContaining("exploded"),
    });
    expect(result.items[1]?.outcome).toBe("ran");
  });

  it("surfaces an engine error result as an error item", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg1", repositoryId: "r1" },
    ] as never);
    const runSync = vi
      .fn()
      .mockResolvedValue(okResult({ status: "error", error: "tree truncated" }));

    const result = await runDueAdrSyncs(db, NOW, { runSync });

    expect(result.items[0]).toMatchObject({
      outcome: "error",
      detail: "tree truncated",
    });
  });
});
