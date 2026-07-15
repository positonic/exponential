/**
 * Scheduler-seam tests for the cron sweep: enabled-only selection, overlap
 * guarding (fresh run blocks, stale run is errored and superseded), broken
 * credentials surfacing as errored run records, and failure isolation
 * between configs. The engine and adapter factory are injected fakes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// The scheduler imports the real engine and adapter modules; stub their heavy
// transitive imports (Prisma env, Notion SDK) — the tests inject fakes anyway.
vi.mock("~/plugins/product/server/services/createTicket", () => ({
  createTicketWithNumber: vi.fn(),
}));
vi.mock("../../notionTicketImport", () => ({
  resolveOrCreateWorkspaceTags: vi.fn(),
  attachTicketTags: vi.fn(),
}));
vi.mock("../notionAdapter", () => ({
  createNotionTicketSyncAdapter: vi.fn(),
}));

import { runDueTicketSyncs, STALE_RUN_MINUTES } from "../scheduler";
import type { InboundSyncResult } from "../engine";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const NOW = new Date("2026-07-15T12:00:00Z");

const CONFIG = {
  id: "cfg1",
  productId: "prod1",
  integrationId: "int1",
  propertyNames: null,
};

const OK_RESULT: InboundSyncResult = {
  runId: "run1",
  dryRun: false,
  created: 1,
  updated: 2,
  skipped: 3,
  conflicts: 0,
  archived: 0,
  failed: 0,
  items: [],
};

const okAdapter = vi.fn().mockResolvedValue({ ok: true, adapter: {} });
const runSync = vi.fn().mockResolvedValue(OK_RESULT);

beforeEach(() => {
  mockReset(db);
  okAdapter.mockClear();
  runSync.mockClear();
  runSync.mockResolvedValue(OK_RESULT);
  db.ticketSyncConfig.findMany.mockResolvedValue([CONFIG] as never);
  db.ticketSyncRun.findFirst.mockResolvedValue(null);
  db.ticketSyncRun.create.mockResolvedValue({} as never);
  db.ticketSyncRun.update.mockResolvedValue({} as never);
});

describe("runDueTicketSyncs", () => {
  it("only sweeps enabled, connected configs", async () => {
    await runDueTicketSyncs(db, NOW, { adapterFactory: okAdapter, runSync });
    expect(db.ticketSyncConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enabled: true, integrationId: { not: null } },
      }),
    );
  });

  it("never runs a soft-disconnected config, even if the query returns it", async () => {
    db.ticketSyncConfig.findMany.mockResolvedValue([
      { ...CONFIG, integrationId: null },
    ] as never);

    const result = await runDueTicketSyncs(db, NOW, {
      adapterFactory: okAdapter,
      runSync,
    });

    expect(runSync).not.toHaveBeenCalled();
    expect(result).toEqual({ swept: 0, items: [] });
  });

  it("runs the engine for each due config and reports counts", async () => {
    const result = await runDueTicketSyncs(db, NOW, {
      adapterFactory: okAdapter,
      runSync,
    });
    expect(runSync).toHaveBeenCalledWith(db, expect.anything(), {
      configId: "cfg1",
      trigger: "cron",
    });
    expect(result.items[0]).toMatchObject({
      outcome: "ran",
      result: { created: 1, updated: 2 },
    });
  });

  it("skips a config whose previous run is still fresh", async () => {
    db.ticketSyncRun.findFirst.mockResolvedValue({
      id: "runX",
      startedAt: new Date(NOW.getTime() - 5 * 60_000),
    } as never);

    const result = await runDueTicketSyncs(db, NOW, {
      adapterFactory: okAdapter,
      runSync,
    });

    expect(runSync).not.toHaveBeenCalled();
    expect(result.items[0]!.outcome).toBe("skipped-running");
  });

  it("marks a stale running run as errored and proceeds", async () => {
    db.ticketSyncRun.findFirst.mockResolvedValue({
      id: "runX",
      startedAt: new Date(NOW.getTime() - (STALE_RUN_MINUTES + 5) * 60_000),
    } as never);

    const result = await runDueTicketSyncs(db, NOW, {
      adapterFactory: okAdapter,
      runSync,
    });

    expect(db.ticketSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "runX" },
        data: expect.objectContaining({ status: "error" }),
      }),
    );
    expect(runSync).toHaveBeenCalled();
    expect(result.items[0]!.outcome).toBe("ran");
  });

  it("records a broken credential as an errored run instead of crashing", async () => {
    const badAdapter = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "No access token" });

    const result = await runDueTicketSyncs(db, NOW, {
      adapterFactory: badAdapter,
      runSync,
    });

    expect(runSync).not.toHaveBeenCalled();
    expect(db.ticketSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trigger: "cron",
          status: "error",
          error: "No access token",
        }),
      }),
    );
    expect(result.items[0]).toMatchObject({
      outcome: "error",
      detail: "No access token",
    });
  });

  it("records an errored run when the engine fails before creating one", async () => {
    runSync.mockRejectedValueOnce(new Error("config vanished"));

    await runDueTicketSyncs(db, NOW, { adapterFactory: okAdapter, runSync });

    expect(db.ticketSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          configId: "cfg1",
          trigger: "cron",
          status: "error",
          error: "config vanished",
        }),
      }),
    );
  });

  it("does not duplicate a run record the engine already errored", async () => {
    runSync.mockRejectedValueOnce(new Error("Notion is down"));
    db.ticketSyncRun.findFirst
      .mockResolvedValueOnce(null) // overlap check: nothing in flight
      .mockResolvedValueOnce({ id: "run-engine" } as never); // engine's own record

    await runDueTicketSyncs(db, NOW, { adapterFactory: okAdapter, runSync });

    expect(db.ticketSyncRun.create).not.toHaveBeenCalled();
  });

  it("keeps sweeping when one config's engine run throws", async () => {
    db.ticketSyncConfig.findMany.mockResolvedValue([
      CONFIG,
      { ...CONFIG, id: "cfg2", productId: "prod2" },
    ] as never);
    runSync
      .mockRejectedValueOnce(new Error("Notion is down"))
      .mockResolvedValueOnce(OK_RESULT);

    const result = await runDueTicketSyncs(db, NOW, {
      adapterFactory: okAdapter,
      runSync,
    });

    expect(result.swept).toBe(2);
    expect(result.items[0]).toMatchObject({
      outcome: "error",
      detail: "Notion is down",
    });
    expect(result.items[1]!.outcome).toBe("ran");
  });
});
