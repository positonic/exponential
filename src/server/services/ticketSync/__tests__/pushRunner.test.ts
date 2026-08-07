/**
 * Tests for the durable outbound-push queue: enqueue coalescing + the drain
 * sweep (run ledger, atomic claim, retry/backoff, toggle-off drop). Deep-mocked
 * PrismaClient; the push engine and adapter factory are injected as fakes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  dispatchTicketCreate,
  dispatchTicketPush,
  enqueueBackfill,
  enqueueTicketPush,
  planBackfill,
  runOutboundPushSweep,
} from "../pushRunner";
import { NonRetryablePushError } from "../push";
import type { OutboundPushItem, TicketPushAdapter } from "../push";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const NOW = new Date("2026-07-12T00:00:00Z");

beforeEach(() => {
  mockReset(db);
  db.ticketSyncPushJob.updateMany.mockResolvedValue({ count: 1 } as never);
  db.ticketSyncPushJob.update.mockResolvedValue({} as never);
  db.ticketSyncPushJob.create.mockResolvedValue({ id: "job1" } as never);
  // Default: the fire-and-forget immediate-kick sweep finds no due jobs.
  db.ticketSyncPushJob.findMany.mockResolvedValue([] as never);
  db.ticketSync.create.mockResolvedValue({ id: "s1" } as never);
  db.ticketSyncRun.create.mockResolvedValue({ id: "run1" } as never);
  db.ticketSyncRun.update.mockResolvedValue({} as never);
});

const okAdapter = {} as TicketPushAdapter;
const adapterFactory = () => Promise.resolve({ ok: true as const, adapter: okAdapter });

function dueJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job1",
    syncId: "s1",
    attempts: 0,
    sync: { configId: "cfg1" },
    ...overrides,
  };
}

function pushEnabledConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "cfg1",
    integrationId: "int1",
    propertyNames: null,
    pushEnabled: true,
    ...overrides,
  };
}

function pushedItem(): OutboundPushItem {
  return {
    syncId: "s1",
    externalId: "page-1",
    ticketId: "t1",
    title: "T",
    action: "pushed",
    wrote: ["title"],
  };
}

describe("enqueueTicketPush", () => {
  it("does not enqueue when the ticket has no push-enabled sync", async () => {
    db.ticketSync.findFirst.mockResolvedValue(null);

    const result = await enqueueTicketPush(db, { ticketId: "t1" });

    expect(result.enqueued).toBe(false);
    expect(result.reason).toBe("not-synced");
    expect(db.ticketSyncPushJob.create).not.toHaveBeenCalled();
  });

  it("creates a PENDING job when none exists", async () => {
    db.ticketSync.findFirst.mockResolvedValue({ id: "s1", configId: "cfg1" } as never);
    db.ticketSyncPushJob.findFirst.mockResolvedValue(null);

    const result = await enqueueTicketPush(db, { ticketId: "t1" });

    expect(result.enqueued).toBe(true);
    expect(db.ticketSyncPushJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncId: "s1", status: "PENDING" }),
      }),
    );
  });

  it("coalesces onto an existing PENDING job instead of stacking", async () => {
    db.ticketSync.findFirst.mockResolvedValue({ id: "s1", configId: "cfg1" } as never);
    db.ticketSyncPushJob.findFirst.mockResolvedValue({ id: "jobX" } as never);

    await enqueueTicketPush(db, { ticketId: "t1" });

    expect(db.ticketSyncPushJob.create).not.toHaveBeenCalled();
    expect(db.ticketSyncPushJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "jobX" } }),
    );
  });
});

describe("dispatchTicketPush", () => {
  it("does not touch the queue when no push-relevant field changed", async () => {
    await dispatchTicketPush(db, {
      ticketId: "t1",
      changedFields: ["branchName", "prUrl"],
    });
    expect(db.ticketSync.findFirst).not.toHaveBeenCalled();
  });

  it("never throws and does not kick when the ticket is not synced", async () => {
    db.ticketSync.findFirst.mockResolvedValue(null);
    await expect(
      dispatchTicketPush(db, { ticketId: "t1", changedFields: ["status"] }),
    ).resolves.toBeUndefined();
  });
});

describe("runOutboundPushSweep", () => {
  it("does nothing (no run) when there are no due jobs", async () => {
    db.ticketSyncPushJob.findMany.mockResolvedValue([]);

    const result = await runOutboundPushSweep(db, NOW, { adapterFactory });

    expect(result.runs).toBe(0);
    expect(db.ticketSyncRun.create).not.toHaveBeenCalled();
  });

  it("drains a due job: records a push run and marks the job COMPLETED", async () => {
    db.ticketSyncPushJob.findMany.mockResolvedValue([dueJob()] as never);
    db.ticketSyncConfig.findUnique.mockResolvedValue(pushEnabledConfig() as never);
    const runPush = vi.fn().mockResolvedValue(pushedItem());

    const result = await runOutboundPushSweep(db, NOW, { adapterFactory, runPush });

    expect(runPush).toHaveBeenCalledWith(db, okAdapter, { syncId: "s1" });
    expect(result.runs).toBe(1);
    expect(result.pushed).toBe(1);
    expect(db.ticketSyncPushJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(db.ticketSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: "push" }) }),
    );
    expect(db.ticketSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "success", updated: 1 }),
      }),
    );
  });

  it("drops jobs without writing when push was disabled before the drain", async () => {
    db.ticketSyncPushJob.findMany.mockResolvedValue([dueJob()] as never);
    db.ticketSyncConfig.findUnique.mockResolvedValue(
      pushEnabledConfig({ pushEnabled: false }) as never,
    );
    const runPush = vi.fn();

    const result = await runOutboundPushSweep(db, NOW, { adapterFactory, runPush });

    expect(runPush).not.toHaveBeenCalled();
    expect(db.ticketSyncRun.create).not.toHaveBeenCalled();
    expect(db.ticketSyncPushJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(result.runs).toBe(0);
  });

  it("records an errored run and backs the jobs off when credentials are broken", async () => {
    db.ticketSyncPushJob.findMany.mockResolvedValue([dueJob()] as never);
    db.ticketSyncConfig.findUnique.mockResolvedValue(pushEnabledConfig() as never);
    const failingFactory = () =>
      Promise.resolve({ ok: false as const, error: "token revoked" });

    const result = await runOutboundPushSweep(db, NOW, {
      adapterFactory: failingFactory,
    });

    expect(result.failed).toBe(1);
    expect(db.ticketSyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "error", error: "token revoked" }),
      }),
    );
  });

  it("retries a transient push failure with backoff and logs it in the run", async () => {
    db.ticketSyncPushJob.findMany.mockResolvedValue([dueJob({ attempts: 0 })] as never);
    db.ticketSyncConfig.findUnique.mockResolvedValue(pushEnabledConfig() as never);
    const runPush = vi.fn().mockRejectedValue(new Error("Notion 502"));

    const result = await runOutboundPushSweep(db, NOW, { adapterFactory, runPush });

    expect(result.failed).toBe(1);
    expect(db.ticketSyncPushJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job1" },
        data: expect.objectContaining({
          status: "PENDING",
          attempts: 1,
          lastError: "Notion 502",
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
    expect(db.ticketSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "success", failed: 1 }),
      }),
    );
  });

  it("gives up (FAILED) after the max attempts is reached", async () => {
    db.ticketSyncPushJob.findMany.mockResolvedValue([dueJob({ attempts: 4 })] as never);
    db.ticketSyncConfig.findUnique.mockResolvedValue(pushEnabledConfig() as never);
    const runPush = vi.fn().mockRejectedValue(new Error("Notion 502"));

    await runOutboundPushSweep(db, NOW, { adapterFactory, runPush });

    expect(db.ticketSyncPushJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", attempts: 5 }),
      }),
    );
  });

  it("does not reschedule a failure whose remote write already landed", async () => {
    db.ticketSyncPushJob.findMany.mockResolvedValue([dueJob({ attempts: 0 })] as never);
    db.ticketSyncConfig.findUnique.mockResolvedValue(pushEnabledConfig() as never);
    const runPush = vi
      .fn()
      .mockRejectedValue(
        new NonRetryablePushError("page created but not linked", "orphan-page-id"),
      );

    const result = await runOutboundPushSweep(db, NOW, { adapterFactory, runPush });

    expect(result.failed).toBe(1);
    // FAILED on the first attempt, not PENDING — a retry would re-enter the
    // create branch and make a second Notion page.
    expect(db.ticketSyncPushJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job1" },
        data: expect.objectContaining({
          status: "FAILED",
          attempts: 1,
          nextAttemptAt: NOW,
        }),
      }),
    );
    // The orphan is named in the run so an operator can find it.
    const runUpdate = db.ticketSyncRun.update.mock.calls[0]![0] as {
      data: { items: Array<{ externalId: string | null; reason?: string }> };
    };
    expect(runUpdate.data.items[0]?.externalId).toBe("orphan-page-id");
    expect(runUpdate.data.items[0]?.reason).toContain("not retried");
  });

  it("skips a job another drain already claimed", async () => {
    db.ticketSyncPushJob.findMany.mockResolvedValue([dueJob()] as never);
    db.ticketSyncConfig.findUnique.mockResolvedValue(pushEnabledConfig() as never);
    // Claim loses the race: updateMany reports zero rows updated.
    db.ticketSyncPushJob.updateMany.mockResolvedValue({ count: 0 } as never);
    const runPush = vi.fn();

    const result = await runOutboundPushSweep(db, NOW, { adapterFactory, runPush });

    expect(runPush).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
  });
});

describe("dispatchTicketCreate", () => {
  it("writes a sentinel sync + job for a non-terminal, unsynced ticket", async () => {
    db.ticket.findUnique.mockResolvedValue({
      id: "t1",
      status: "IN_PROGRESS",
      productId: "p1",
      _count: { syncs: 0 },
    } as never);
    db.ticketSyncConfig.findFirst.mockResolvedValue({ id: "cfg1" } as never);

    await dispatchTicketCreate(db, { ticketId: "t1" });

    expect(db.ticketSync.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "t1",
          externalId: "pending:t1",
        }),
      }),
    );
    expect(db.ticketSyncPushJob.create).toHaveBeenCalled();
  });

  it("does not mirror a terminal ticket", async () => {
    db.ticket.findUnique.mockResolvedValue({
      id: "t1",
      status: "DONE",
      productId: "p1",
      _count: { syncs: 0 },
    } as never);

    await dispatchTicketCreate(db, { ticketId: "t1" });

    expect(db.ticketSyncConfig.findFirst).not.toHaveBeenCalled();
    expect(db.ticketSync.create).not.toHaveBeenCalled();
  });

  it("does not mirror a ticket that already has a sync", async () => {
    db.ticket.findUnique.mockResolvedValue({
      id: "t1",
      status: "IN_PROGRESS",
      productId: "p1",
      _count: { syncs: 1 },
    } as never);

    await dispatchTicketCreate(db, { ticketId: "t1" });

    expect(db.ticketSync.create).not.toHaveBeenCalled();
  });

  it("does nothing when the product has no push-enabled sync", async () => {
    db.ticket.findUnique.mockResolvedValue({
      id: "t1",
      status: "IN_PROGRESS",
      productId: "p1",
      _count: { syncs: 0 },
    } as never);
    db.ticketSyncConfig.findFirst.mockResolvedValue(null);

    await dispatchTicketCreate(db, { ticketId: "t1" });

    expect(db.ticketSync.create).not.toHaveBeenCalled();
  });

  // The 2026-07 CLEAR duplication: an imported ticket whose sync record never
  // existed looks "unsynced", so the mirror created a second Notion page for a
  // row Notion already had. Provenance, not the sync row, settles the origin.
  it("does not mirror a ticket that carries Notion provenance but no sync", async () => {
    db.ticket.findUnique.mockResolvedValue({
      id: "t1",
      status: "IN_PROGRESS",
      productId: "p1",
      links: { notionPageId: "page-from-notion" },
      _count: { syncs: 0 },
    } as never);

    await dispatchTicketCreate(db, { ticketId: "t1" });

    expect(db.ticketSyncConfig.findFirst).not.toHaveBeenCalled();
    expect(db.ticketSync.create).not.toHaveBeenCalled();
  });

  it("still mirrors a ticket whose links carry no Notion page id", async () => {
    db.ticket.findUnique.mockResolvedValue({
      id: "t1",
      status: "IN_PROGRESS",
      productId: "p1",
      links: { github: "https://github.com/o/r/pull/1" },
      _count: { syncs: 0 },
    } as never);
    db.ticketSyncConfig.findFirst.mockResolvedValue({ id: "cfg1" } as never);

    await dispatchTicketCreate(db, { ticketId: "t1" });

    expect(db.ticketSync.create).toHaveBeenCalled();
  });
});

describe("planBackfill / enqueueBackfill", () => {
  it("plans exactly the non-terminal, unsynced tickets", async () => {
    db.ticketSyncConfig.findUnique.mockResolvedValue({ productId: "p1" } as never);
    db.ticket.findMany.mockResolvedValue([
      { id: "t1", title: "A", number: 1 },
      { id: "t2", title: "B", number: 2 },
    ] as never);

    const plan = await planBackfill(db, { configId: "cfg1" });

    expect(plan).toHaveLength(2);
    expect(db.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productId: "p1",
          syncs: { none: {} },
          status: expect.objectContaining({ notIn: expect.any(Array) }),
        }),
      }),
    );
  });

  it("enqueues a create job per unsynced ticket", async () => {
    db.ticketSyncConfig.findUnique.mockResolvedValue({
      id: "cfg1",
      productId: "p1",
      pushEnabled: true,
      integrationId: "int1",
    } as never);
    db.ticket.findMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }] as never);

    const result = await enqueueBackfill(db, { configId: "cfg1" });

    expect(result.enqueued).toBe(2);
    expect(db.ticketSync.create).toHaveBeenCalledTimes(2);
    expect(db.ticketSyncPushJob.create).toHaveBeenCalledTimes(2);
  });

  it("excludes Notion-born tickets from the plan and the enqueue alike", async () => {
    const rows = [
      { id: "t1", title: "Born here", number: 1, links: null },
      {
        id: "t2",
        title: "Came from Notion",
        number: 2,
        links: { notionPageId: "page-1", notion: "https://notion.so/page-1" },
      },
      { id: "t3", title: "Also born here", number: 3, links: { github: "x" } },
    ];

    db.ticketSyncConfig.findUnique.mockResolvedValue({
      id: "cfg1",
      productId: "p1",
      pushEnabled: true,
      integrationId: "int1",
    } as never);
    db.ticket.findMany.mockResolvedValue(rows as never);

    const plan = await planBackfill(db, { configId: "cfg1" });
    expect(plan.map((p) => p.ticketId)).toEqual(["t1", "t3"]);

    const result = await enqueueBackfill(db, { configId: "cfg1" });
    expect(result.enqueued).toBe(2);
    expect(db.ticketSync.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ticketId: "t2" }),
      }),
    );
  });

  it("refuses to backfill when push is disabled", async () => {
    db.ticketSyncConfig.findUnique.mockResolvedValue({
      id: "cfg1",
      productId: "p1",
      pushEnabled: false,
      integrationId: "int1",
    } as never);

    const result = await enqueueBackfill(db, { configId: "cfg1" });

    expect(result.enqueued).toBe(0);
    expect(db.ticket.findMany).not.toHaveBeenCalled();
  });
});
