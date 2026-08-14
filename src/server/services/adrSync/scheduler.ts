import type { PrismaClient } from "@prisma/client";
import { runAdrSync, type AdrSyncResult } from "./engine";
import type { AdrRemoteFactory } from "./github";

/**
 * adrSync/scheduler — one cron sweep over every enabled ADR sync config
 * (copying ticketSync/scheduler's shape). Guards:
 * - disconnected configs (null integrationId, ADR-0042 semantics) are a
 *   deliberate user state, not a broken credential — they are simply never
 *   due, so they don't pile errored runs into the ledger every hour;
 * - overlap: a run still marked `running` blocks new runs for its config,
 *   unless it started more than {@link STALE_RUN_MINUTES} ago — then it is
 *   presumed crashed, marked errored, and the sweep proceeds;
 * - one config's failure never blocks the others.
 *
 * The rate-limit budget lives in the engine: an unchanged repo costs the
 * tree walk only (zero blob fetches) and closes its run as `unchanged`.
 */

export const STALE_RUN_MINUTES = 30;

export interface AdrSweepItem {
  configId: string;
  repositoryId: string;
  outcome: "ran" | "unchanged" | "skipped-running" | "error";
  detail?: string;
  result?: Pick<
    AdrSyncResult,
    "created" | "updated" | "skipped" | "deleted" | "failed"
  >;
}

type SyncRunner = typeof runAdrSync;

export async function runDueAdrSyncs(
  db: PrismaClient,
  now: Date,
  deps?: { remoteFactory?: AdrRemoteFactory; runSync?: SyncRunner },
): Promise<{ swept: number; items: AdrSweepItem[] }> {
  const runSync = deps?.runSync ?? runAdrSync;

  const configs = await db.adrSyncConfig.findMany({
    where: { enabled: true, integrationId: { not: null } },
    select: { id: true, repositoryId: true },
  });

  const items: AdrSweepItem[] = [];
  const staleBefore = new Date(now.getTime() - STALE_RUN_MINUTES * 60_000);

  for (const config of configs) {
    try {
      const inFlight = await db.adrSyncRun.findFirst({
        where: { configId: config.id, status: "running" },
        orderBy: { startedAt: "desc" },
        select: { id: true, startedAt: true },
      });

      if (inFlight) {
        if (inFlight.startedAt > staleBefore) {
          items.push({
            configId: config.id,
            repositoryId: config.repositoryId,
            outcome: "skipped-running",
            detail: `run ${inFlight.id} still in flight`,
          });
          continue;
        }
        // Presumed crashed — unblock the config and record why.
        await db.adrSyncRun.update({
          where: { id: inFlight.id },
          data: {
            status: "error",
            finishedAt: now,
            error: `presumed crashed after ${STALE_RUN_MINUTES} minutes; superseded by a newer sweep`,
          },
        });
      }

      const result = await runSync(db, config.id, "cron", {
        remoteFactory: deps?.remoteFactory,
      });
      if (result.status === "error") {
        // The engine already recorded the errored run; surface it here too so
        // the sweep summary shows it.
        items.push({
          configId: config.id,
          repositoryId: config.repositoryId,
          outcome: "error",
          detail: result.error,
        });
        continue;
      }
      items.push({
        configId: config.id,
        repositoryId: config.repositoryId,
        outcome: result.status === "unchanged" ? "unchanged" : "ran",
        result: {
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          deleted: result.deleted,
          failed: result.failed,
        },
      });
    } catch (error) {
      // A failure before the engine could record anything (config vanished,
      // run insert failed) must not stop the sweep.
      items.push({
        configId: config.id,
        repositoryId: config.repositoryId,
        outcome: "error",
        detail: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return { swept: configs.length, items };
}
