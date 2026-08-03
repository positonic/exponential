/**
 * Integration test for the durable outbound-push queue drain (ADR-0046),
 * against a REAL Postgres (Testcontainers). These four behaviours all hinge on
 * database semantics a mocked Prisma cannot prove — atomic row claims under
 * genuine concurrency, the stale-RUNNING reclaim, enqueue coalescing via a
 * partial-unique read, and attempt/backoff bookkeeping across sweeps:
 *
 *   1. No double-claim  — two sweeps racing over the same PENDING jobs each
 *      write every job exactly once (the PENDING→RUNNING `updateMany` claim is
 *      the serialization point; only one sweep wins per row).
 *   2. Stale reclaim    — a job wedged RUNNING past the stale window is flipped
 *      back to PENDING and retried; a freshly-RUNNING job is left alone.
 *   3. Coalescing       — rapid `enqueueTicketPush` calls collapse onto ONE
 *      PENDING job, and the eventual drain reads the ticket's latest state.
 *   4. Backoff          — a failing adapter increments attempts with a growing
 *      nextAttemptAt, then stops at MAX_ATTEMPTS with lastError recorded.
 *
 * The push engine is injected as a fake via `runOutboundPushSweep`'s `runPush`
 * dep (and `adapterFactory` short-circuited to an OK no-op adapter), so ZERO
 * Notion calls happen — the test exercises only the queue mechanics.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getTestDb } from "~/test/test-db";
import {
  createUser,
  createWorkspace,
  createProduct,
  createTicket,
} from "~/test/factories";
import {
  enqueueTicketPush,
  runOutboundPushSweep,
} from "../pushRunner";
import type { OutboundPushItem, TicketPushAdapter } from "../push";

// Mirrors of the (un-exported) constants in pushRunner.ts — kept in sync by
// hand so the assertions read against the real thresholds.
const MAX_ATTEMPTS = 5;
const STALE_RUNNING_MINUTES = 15;
const backoffMs = (attempts: number) => Math.min(2 ** attempts, 60) * 60_000;

type SweepDeps = NonNullable<Parameters<typeof runOutboundPushSweep>[2]>;

// The adapter is never touched once `runPush` is overridden, but the sweep
// still calls `adapterFactory` before draining, so it must report OK.
const okAdapter = { ok: true as const, adapter: {} as unknown as TicketPushAdapter };
const adapterFactory: SweepDeps["adapterFactory"] = () => Promise.resolve(okAdapter);

function pushedItem(syncId: string): OutboundPushItem {
  return {
    syncId,
    externalId: `ext-${syncId}`,
    ticketId: "",
    title: "",
    action: "pushed",
  };
}

describe("ticketSync push queue (integration)", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  async function baseSetup() {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });
    const integration = await db.integration.create({
      data: {
        name: "Notion (test)",
        type: "API_KEY",
        provider: "notion",
        userId: user.id,
      },
    });
    const config = await db.ticketSyncConfig.create({
      data: {
        productId: product.id,
        provider: "notion",
        integrationId: integration.id,
        databaseId: "notion-db-1",
        databaseName: "Backlog",
        pushEnabled: true,
        createdById: user.id,
      },
    });
    return { user, ws, product, config };
  }

  async function makeSyncedTicket(
    user: { id: string },
    product: { id: string },
    config: { id: string },
    title = "Ticket",
  ) {
    const ticket = await createTicket(db, {
      productId: product.id,
      createdById: user.id,
      title,
    });
    const sync = await db.ticketSync.create({
      data: {
        configId: config.id,
        ticketId: ticket.id,
        provider: "notion",
        externalId: `page-${ticket.id}`,
      },
    });
    return { ticket, sync };
  }

  it("no double-claim: two racing sweeps write every job exactly once", async () => {
    const { user, product, config } = await baseSetup();

    const N = 8;
    const past = new Date(Date.now() - 60_000);
    for (let i = 0; i < N; i++) {
      const { sync } = await makeSyncedTicket(user, product, config, `T${i}`);
      await db.ticketSyncPushJob.create({
        data: { syncId: sync.id, status: "PENDING", nextAttemptAt: past },
      });
    }

    // Every push the drain performs is recorded here. A double-claim would push
    // the same job twice and this array would contain a duplicate syncId.
    const writes: string[] = [];
    const deps: SweepDeps = {
      adapterFactory,
      runPush: async (_db: PrismaClient, _adapter, params) => {
        // A tiny async hop so the two concurrent sweeps genuinely interleave
        // between their claim and their write.
        await Promise.resolve();
        writes.push(params.syncId);
        return pushedItem(params.syncId);
      },
    };

    const now = new Date();
    const [a, b] = await Promise.all([
      runOutboundPushSweep(db, now, deps),
      runOutboundPushSweep(db, now, deps),
    ]);

    // Exactly one write per job, no duplicates — the atomic claim held.
    expect(writes).toHaveLength(N);
    expect(new Set(writes).size).toBe(N);
    // The N processed jobs are split across the two sweeps, never counted twice.
    expect(a.processed + b.processed).toBe(N);

    const jobs = await db.ticketSyncPushJob.findMany();
    expect(jobs).toHaveLength(N);
    expect(jobs.every((j) => j.status === "COMPLETED")).toBe(true);
  });

  it("stale-RUNNING reclaim: a wedged job is retried, a fresh one is left alone", async () => {
    const { user, product, config } = await baseSetup();
    const stale = await makeSyncedTicket(user, product, config, "stale");
    const fresh = await makeSyncedTicket(user, product, config, "fresh");

    const now = new Date();
    const dueAt = new Date(now.getTime() - 60_000);
    // Wedged RUNNING past the stale window — a frozen serverless drain.
    const staleJob = await db.ticketSyncPushJob.create({
      data: {
        syncId: stale.sync.id,
        status: "RUNNING",
        startedAt: new Date(now.getTime() - (STALE_RUNNING_MINUTES + 5) * 60_000),
        nextAttemptAt: dueAt,
      },
    });
    // Freshly RUNNING — inside the stale window, a live drain still owns it.
    const freshJob = await db.ticketSyncPushJob.create({
      data: {
        syncId: fresh.sync.id,
        status: "RUNNING",
        startedAt: now,
        nextAttemptAt: dueAt,
      },
    });

    const writes: string[] = [];
    const deps: SweepDeps = {
      adapterFactory,
      runPush: async (_db: PrismaClient, _adapter, params) => {
        writes.push(params.syncId);
        return pushedItem(params.syncId);
      },
    };

    await runOutboundPushSweep(db, now, deps);

    // Only the stale job was reclaimed and pushed.
    expect(writes).toEqual([stale.sync.id]);

    const reclaimed = await db.ticketSyncPushJob.findUnique({
      where: { id: staleJob.id },
    });
    expect(reclaimed?.status).toBe("COMPLETED");
    expect(reclaimed?.attempts).toBe(1);

    const untouched = await db.ticketSyncPushJob.findUnique({
      where: { id: freshJob.id },
    });
    expect(untouched?.status).toBe("RUNNING");
  });

  it("coalescing: rapid enqueues collapse to one job that pushes the latest state", async () => {
    const { user, product, config } = await baseSetup();
    const { ticket, sync } = await makeSyncedTicket(user, product, config, "v0");

    // Rapid successive edits, each re-enqueuing. The pending job must be updated
    // in place, never duplicated.
    await enqueueTicketPush(db, { ticketId: ticket.id });
    await db.ticket.update({ where: { id: ticket.id }, data: { title: "v1" } });
    await enqueueTicketPush(db, { ticketId: ticket.id });
    await db.ticket.update({ where: { id: ticket.id }, data: { title: "v2" } });
    const last = await enqueueTicketPush(db, { ticketId: ticket.id });
    expect(last.enqueued).toBe(true);

    const pending = await db.ticketSyncPushJob.findMany({
      where: { syncId: sync.id },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe("PENDING");

    // The drain reads the ticket's latest state at push time — record what it saw.
    const pushedTitles: string[] = [];
    const deps: SweepDeps = {
      adapterFactory,
      runPush: async (dbc: PrismaClient, _adapter, params) => {
        const s = await dbc.ticketSync.findUnique({
          where: { id: params.syncId },
          include: { ticket: { select: { title: true } } },
        });
        if (s) pushedTitles.push(s.ticket.title);
        return pushedItem(params.syncId);
      },
    };

    await runOutboundPushSweep(db, new Date(), deps);

    // A single push, carrying the newest value — not v0/v1.
    expect(pushedTitles).toEqual(["v2"]);
  });

  it("backoff: a failing job increments attempts with growing delay, then stops at MAX_ATTEMPTS", async () => {
    const { user, product, config } = await baseSetup();
    const { sync } = await makeSyncedTicket(user, product, config, "flaky");

    const job = await db.ticketSyncPushJob.create({
      data: {
        syncId: sync.id,
        status: "PENDING",
        nextAttemptAt: new Date(0),
      },
    });

    const errMessage = "notion 503 upstream";
    let calls = 0;
    const deps: SweepDeps = {
      adapterFactory,
      runPush: async () => {
        calls++;
        throw new Error(errMessage);
      },
    };

    // Drive one sweep per attempt. `now` is advanced by 2h each time — well past
    // any backoff (capped at 60m) — so the job is always due for the next try.
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    const deltas: number[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const now = new Date(base + attempt * 2 * 60 * 60_000);
      await runOutboundPushSweep(db, now, deps);

      const row = await db.ticketSyncPushJob.findUnique({ where: { id: job.id } });
      expect(row?.attempts).toBe(attempt);
      expect(row?.lastError).toBe(errMessage);

      if (attempt < MAX_ATTEMPTS) {
        expect(row?.status).toBe("PENDING");
        const nextAt = row?.nextAttemptAt;
        if (nextAt) deltas.push(nextAt.getTime() - now.getTime());
      } else {
        // Attempts exhausted — the job gives up and stops retrying.
        expect(row?.status).toBe("FAILED");
      }
    }

    expect(calls).toBe(MAX_ATTEMPTS);
    // Backoff schedule matches 2^attempt minutes and is strictly growing.
    expect(deltas).toEqual([
      backoffMs(1),
      backoffMs(2),
      backoffMs(3),
      backoffMs(4),
    ]);
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]!).toBeGreaterThan(deltas[i - 1]!);
    }

    // A later sweep must NOT resurrect a FAILED job.
    await runOutboundPushSweep(db, new Date(base + 100 * 60 * 60_000), deps);
    expect(calls).toBe(MAX_ATTEMPTS);
  });
});
