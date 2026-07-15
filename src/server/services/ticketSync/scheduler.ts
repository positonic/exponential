import type { PrismaClient } from "@prisma/client";
import {
  runInboundTicketSync,
  type InboundSyncResult,
  type TicketSyncRemoteAdapter,
} from "./engine";
import { createNotionTicketSyncAdapter } from "./notionAdapter";

/**
 * ticketSync/scheduler — one cron sweep over every enabled sync config.
 *
 * Each due config gets an inbound run (incremental window handled by the
 * engine). Guards:
 * - overlap: a run still marked `running` blocks new runs for its config,
 *   unless it started more than {@link STALE_RUN_MINUTES} ago — then it is
 *   presumed crashed, marked errored, and the sweep proceeds;
 * - credential failures surface as errored run records, never as a crash of
 *   the whole sweep;
 * - one config's failure never blocks the others.
 */

export const STALE_RUN_MINUTES = 30;

export interface SweepItem {
  configId: string;
  productId: string;
  outcome: "ran" | "skipped-running" | "error";
  detail?: string;
  result?: Pick<
    InboundSyncResult,
    "created" | "updated" | "skipped" | "conflicts" | "archived" | "failed"
  >;
}

type AdapterFactory = (
  db: PrismaClient,
  config: { integrationId: string; propertyNames: unknown },
) => Promise<
  { ok: true; adapter: TicketSyncRemoteAdapter } | { ok: false; error: string }
>;

type SyncRunner = typeof runInboundTicketSync;

export async function runDueTicketSyncs(
  db: PrismaClient,
  now: Date,
  deps?: { adapterFactory?: AdapterFactory; runSync?: SyncRunner },
): Promise<{ swept: number; items: SweepItem[] }> {
  const adapterFactory = deps?.adapterFactory ?? createNotionTicketSyncAdapter;
  const runSync = deps?.runSync ?? runInboundTicketSync;

  const configs = await db.ticketSyncConfig.findMany({
    where: { enabled: true },
    select: { id: true, productId: true, integrationId: true, propertyNames: true },
  });

  const items: SweepItem[] = [];
  const staleBefore = new Date(now.getTime() - STALE_RUN_MINUTES * 60_000);

  for (const config of configs) {
    try {
      const inFlight = await db.ticketSyncRun.findFirst({
        where: { configId: config.id, status: "running" },
        orderBy: { startedAt: "desc" },
        select: { id: true, startedAt: true },
      });

      if (inFlight) {
        if (inFlight.startedAt > staleBefore) {
          items.push({
            configId: config.id,
            productId: config.productId,
            outcome: "skipped-running",
            detail: `run ${inFlight.id} still in flight`,
          });
          continue;
        }
        // Presumed crashed — unblock the config and record why.
        await db.ticketSyncRun.update({
          where: { id: inFlight.id },
          data: {
            status: "error",
            finishedAt: now,
            error: `presumed crashed after ${STALE_RUN_MINUTES} minutes; superseded by a newer sweep`,
          },
        });
      }

      const adapterResult = await adapterFactory(db, config);
      if (!adapterResult.ok) {
        // Surface the broken connection as an errored run so the run history
        // shows it — a silently skipped config reads as "sync is fine".
        await db.ticketSyncRun.create({
          data: {
            configId: config.id,
            trigger: "cron",
            direction: "pull",
            status: "error",
            startedAt: now,
            finishedAt: now,
            error: adapterResult.error,
          },
        });
        items.push({
          configId: config.id,
          productId: config.productId,
          outcome: "error",
          detail: adapterResult.error,
        });
        continue;
      }

      const result = await runSync(db, adapterResult.adapter, {
        configId: config.id,
        trigger: "cron",
      });
      items.push({
        configId: config.id,
        productId: config.productId,
        outcome: "ran",
        result: {
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          conflicts: result.conflicts,
          archived: result.archived,
          failed: result.failed,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      // The engine records its own errored run once one exists; a failure
      // before that point (config vanished, run insert failed) would leave
      // no trace in the run history — record it here, best-effort.
      try {
        const recorded = await db.ticketSyncRun.findFirst({
          where: { configId: config.id, startedAt: { gte: now } },
          select: { id: true },
        });
        if (!recorded) {
          await db.ticketSyncRun.create({
            data: {
              configId: config.id,
              trigger: "cron",
              direction: "pull",
              status: "error",
              startedAt: now,
              finishedAt: now,
              error: detail,
            },
          });
        }
      } catch {
        // Recording the failure must never stop the sweep.
      }
      items.push({
        configId: config.id,
        productId: config.productId,
        outcome: "error",
        detail,
      });
    }
  }

  return { swept: configs.length, items };
}
