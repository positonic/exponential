import type { Prisma, PrismaClient } from "@prisma/client";
import {
  runOutboundTicketPush,
  type OutboundPushItem,
  type TicketPushAdapter,
} from "./push";
import { createNotionTicketSyncAdapter } from "./notionAdapter";

/**
 * ticketSync/pushRunner — the durable outbound-push queue drain (ADR-0046).
 *
 * A synced-ticket mutation calls {@link dispatchTicketPush}, which writes a
 * durable `TicketSyncPushJob` row (the queue entry) and best-effort kicks an
 * immediate drain. A cron (`/api/cron/ticket-sync-push`) drains anything the
 * kick missed and retries transient failures with backoff. The durable row —
 * rather than a fire-and-forget push — is what lets a retry survive a
 * serverless freeze (the same reasoning as the CrmContactEnrichment queue).
 *
 * Each drain invocation with due jobs records ONE `TicketSyncRun`
 * (`direction: "push"`) per config, with per-job outcomes as run items — so
 * push successes and, crucially, failures are first-class in the run history
 * (never silently dropped). The workspace activity feed is deliberately NOT
 * written per push run: an outbound run fires on (nearly) every ticket edit,
 * and the ticket edit already posts its own feed event — a second per-run
 * event would flood the feed (altitude rule, ADR-0042/0023). The durable
 * ledger is `TicketSyncRun`, surfaced by the sync run-history UI.
 */

/** Router fields whose change should trigger an outbound push. */
export const PUSH_RELEVANT_TICKET_FIELDS = [
  "title",
  "status",
  "priority",
  "type",
  "points",
  "cycleId",
  "assigneeId",
] as const;

const MAX_ATTEMPTS = 5;
const STALE_RUNNING_MINUTES = 15;
const MAX_JOBS_PER_SWEEP = 200;

/** Exponential backoff (minutes → ms), capped at 1h, keyed on attempt count. */
function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts, 60) * 60_000;
}

interface EnqueueResult {
  enqueued: boolean;
  syncId?: string;
  configId?: string;
  reason?: "not-synced" | "push-disabled" | "disconnected" | "tombstoned";
}

/**
 * Write (or refresh) a PENDING push job for a ticket, if it has an active,
 * push-enabled Notion sync. Idempotent: coalesces rapid edits onto one PENDING
 * job — the drain reads the ticket's latest state at push time, so a single
 * pending job always pushes the newest values.
 */
export async function enqueueTicketPush(
  db: PrismaClient,
  params: { ticketId: string },
): Promise<EnqueueResult> {
  const sync = await db.ticketSync.findFirst({
    where: {
      ticketId: params.ticketId,
      provider: "notion",
      tombstonedAt: null,
      config: { pushEnabled: true, integrationId: { not: null } },
    },
    select: { id: true, configId: true },
  });
  if (!sync) return { enqueued: false, reason: "not-synced" };

  const now = new Date();
  const existing = await db.ticketSyncPushJob.findFirst({
    where: { syncId: sync.id, status: "PENDING" },
    select: { id: true },
  });
  if (existing) {
    // Coalesce: bring the pending job's next-attempt forward to now.
    await db.ticketSyncPushJob.update({
      where: { id: existing.id },
      data: { nextAttemptAt: now },
    });
  } else {
    await db.ticketSyncPushJob.create({
      data: { syncId: sync.id, status: "PENDING", nextAttemptAt: now },
    });
  }
  return { enqueued: true, syncId: sync.id, configId: sync.configId };
}

/**
 * Fire-and-forget push dispatch for a ticket mutation. Enqueues the durable
 * job, then kicks a best-effort immediate drain scoped to the config (Vercel
 * may freeze the detached drain — the cron + durable row is the safety net).
 * Never throws: a push must never break a ticket edit.
 *
 * `changedFields` (the router's `fieldsChanged`) short-circuits the enqueue
 * when nothing push-relevant moved, so an edit to e.g. `branchName` alone does
 * not queue a no-op push.
 */
export async function dispatchTicketPush(
  db: PrismaClient,
  params: { ticketId: string; changedFields?: string[] },
): Promise<void> {
  try {
    if (params.changedFields) {
      const relevant = new Set<string>(PUSH_RELEVANT_TICKET_FIELDS);
      if (!params.changedFields.some((f) => relevant.has(f))) return;
    }
    const result = await enqueueTicketPush(db, { ticketId: params.ticketId });
    if (!result.enqueued || !result.configId) return;
    // Best-effort low-latency kick; the cron drains anything it misses.
    void runOutboundPushSweep(db, new Date(), {
      configId: result.configId,
      trigger: "manual",
    }).catch((err) => {
      console.error("[ticketSync push] immediate drain failed", err);
    });
  } catch (err) {
    console.error("[ticketSync push] dispatch failed", err);
  }
}

type AdapterFactory = (
  db: PrismaClient,
  config: { integrationId: string; propertyNames: unknown },
) => Promise<
  { ok: true; adapter: TicketPushAdapter } | { ok: false; error: string }
>;

export interface PushSweepResult {
  /** Push runs recorded (one per config with due jobs). */
  runs: number;
  processed: number;
  pushed: number;
  skipped: number;
  conflicts: number;
  failed: number;
}

/**
 * Drain due push jobs. Optionally scoped to one config (the immediate kick);
 * unscoped is the cron sweep over every config. Reclaims stale RUNNING jobs
 * (a frozen drain), claims each job atomically (PENDING→RUNNING) so two drains
 * never double-write, and retries transient failures with backoff up to
 * {@link MAX_ATTEMPTS} before recording them as failed run items.
 */
export async function runOutboundPushSweep(
  db: PrismaClient,
  now: Date,
  deps?: {
    configId?: string;
    trigger?: "cron" | "manual" | "agent";
    adapterFactory?: AdapterFactory;
    runPush?: typeof runOutboundTicketPush;
  },
): Promise<PushSweepResult> {
  const adapterFactory = deps?.adapterFactory ?? createNotionTicketSyncAdapter;
  const runPush = deps?.runPush ?? runOutboundTicketPush;
  const trigger = deps?.trigger ?? "cron";

  const result: PushSweepResult = {
    runs: 0,
    processed: 0,
    pushed: 0,
    skipped: 0,
    conflicts: 0,
    failed: 0,
  };

  // Reclaim jobs stuck RUNNING past the stale window (a frozen serverless
  // drain) so they become eligible again instead of wedging forever.
  const staleBefore = new Date(now.getTime() - STALE_RUNNING_MINUTES * 60_000);
  await db.ticketSyncPushJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: staleBefore } },
    data: { status: "PENDING" },
  });

  const due = await db.ticketSyncPushJob.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
      ...(deps?.configId ? { sync: { configId: deps.configId } } : {}),
    },
    select: { id: true, syncId: true, attempts: true, sync: { select: { configId: true } } },
    orderBy: { createdAt: "asc" },
    take: MAX_JOBS_PER_SWEEP,
  });
  if (due.length === 0) return result;

  // Group jobs by config so each config gets exactly one push run.
  const byConfig = new Map<string, typeof due>();
  for (const job of due) {
    const configId = job.sync.configId;
    const list = byConfig.get(configId) ?? [];
    list.push(job);
    byConfig.set(configId, list);
  }

  for (const [configId, jobs] of byConfig) {
    const config = await db.ticketSyncConfig.findUnique({
      where: { id: configId },
      select: { id: true, integrationId: true, propertyNames: true, pushEnabled: true },
    });

    // Toggle turned off (or disconnected) since these jobs were enqueued:
    // drop them without writing to Notion and without a run record.
    if (!config || !config.pushEnabled || !config.integrationId) {
      await db.ticketSyncPushJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) }, status: "PENDING" },
        data: { status: "COMPLETED", lastError: "push disabled before drain" },
      });
      continue;
    }

    const adapterResult = await adapterFactory(db, {
      integrationId: config.integrationId,
      propertyNames: config.propertyNames,
    });
    if (!adapterResult.ok) {
      // Broken credential — record an errored run so the history shows it, and
      // leave the jobs PENDING with backoff so a fixed connection retries them.
      await db.ticketSyncRun.create({
        data: {
          configId,
          trigger,
          direction: "push",
          status: "error",
          startedAt: now,
          finishedAt: new Date(),
          error: adapterResult.error,
          failed: jobs.length,
        },
      });
      await db.ticketSyncPushJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) }, status: "PENDING" },
        data: {
          lastError: adapterResult.error,
          nextAttemptAt: new Date(now.getTime() + backoffMs(1)),
        },
      });
      result.runs++;
      result.failed += jobs.length;
      continue;
    }

    const run = await db.ticketSyncRun.create({
      data: {
        configId,
        trigger,
        direction: "push",
        status: "running",
        startedAt: now,
      },
    });
    result.runs++;

    const items: OutboundPushItem[] = [];
    const counts = { pushed: 0, skipped: 0, conflicts: 0, failed: 0 };

    for (const job of jobs) {
      // Claim the job atomically; if another drain already took it, skip.
      const claim = await db.ticketSyncPushJob.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "RUNNING", startedAt: now },
      });
      if (claim.count !== 1) continue;

      result.processed++;
      try {
        const item = await runPush(db, adapterResult.adapter, {
          syncId: job.syncId,
        });
        items.push(item);
        if (item.action === "pushed") counts.pushed++;
        else if (item.action === "conflict") counts.conflicts++;
        else counts.skipped++;
        await db.ticketSyncPushJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", attempts: job.attempts + 1 },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        const attempts = job.attempts + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        await db.ticketSyncPushJob.update({
          where: { id: job.id },
          data: {
            status: exhausted ? "FAILED" : "PENDING",
            attempts,
            lastError: message,
            nextAttemptAt: exhausted
              ? now
              : new Date(now.getTime() + backoffMs(attempts)),
          },
        });
        counts.failed++;
        items.push({
          syncId: job.syncId,
          externalId: null,
          ticketId: "",
          title: "",
          action: "failed",
          reason: exhausted
            ? `${message} (gave up after ${attempts} attempts)`
            : `${message} (will retry, attempt ${attempts}/${MAX_ATTEMPTS})`,
        });
      }
    }

    await db.ticketSyncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        updated: counts.pushed,
        skipped: counts.skipped,
        conflicts: counts.conflicts,
        failed: counts.failed,
        items: items as unknown as Prisma.InputJsonValue,
      },
    });

    result.pushed += counts.pushed;
    result.skipped += counts.skipped;
    result.conflicts += counts.conflicts;
    result.failed += counts.failed;
  }

  return result;
}
