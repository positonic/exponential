import type { PrismaClient } from "@prisma/client";

import { distributeWorkspaceUpdate, type DistributeChannels } from "./distribute";
import { generateWorkspaceUpdate, type GenerateDeps, type GenerateResult } from "./generate";
import { dueWeeklyInstant, weeklyPeriodKey } from "./schedule";
import { WORKSPACE_UPDATE_KIND, WORKSPACE_UPDATE_STATUS } from "./types";
import { resolveWindowStart } from "./window";

export interface RunWorkspaceUpdatesResult {
  evaluated: number;
  due: number;
  drafted: string[];
  empty: string[];
  alreadyClaimed: string[];
  failed: { workspaceId: string; error: string }[];
}

/**
 * The hourly sweep behind `/api/cron/workspace-updates`: draft the weekly
 * update for every enabled workspace whose local trigger has just passed.
 * Exactly-once per period comes from generation's claim on the unique
 * (workspace, kind, period) row; one workspace failing never stops the rest.
 */
export async function runDueWorkspaceUpdates(
  db: PrismaClient,
  now: Date,
  depsFor: (workspaceId: string) => GenerateDeps,
): Promise<RunWorkspaceUpdatesResult> {
  const configs = await db.workspaceUpdateConfig.findMany({
    where: { enabled: true },
    select: { workspaceId: true, weekday: true, hour: true, timezone: true, enabledAt: true },
  });

  const result: RunWorkspaceUpdatesResult = {
    evaluated: configs.length,
    due: 0,
    drafted: [],
    empty: [],
    alreadyClaimed: [],
    failed: [],
  };

  for (const config of configs) {
    let instant: Date | null;
    try {
      instant = dueWeeklyInstant(config, now);
    } catch (err) {
      // An unknown timezone fails here, not the whole sweep.
      result.failed.push({ workspaceId: config.workspaceId, error: errorMessage(err) });
      continue;
    }
    if (!instant) continue;

    const periodKey = weeklyPeriodKey(instant, config.timezone);
    const existing = await db.workspaceUpdate.findUnique({
      where: {
        workspaceId_kind_periodKey: {
          workspaceId: config.workspaceId,
          kind: WORKSPACE_UPDATE_KIND.WEEKLY,
          periodKey,
        },
      },
      select: { id: true },
    });
    if (existing) continue;
    result.due++;

    try {
      const windowStart = await resolveWindowStart(db, {
        workspaceId: config.workspaceId,
        kind: WORKSPACE_UPDATE_KIND.WEEKLY,
        windowEnd: instant,
      });
      const outcome: GenerateResult = await generateWorkspaceUpdate(
        db,
        {
          workspaceId: config.workspaceId,
          kind: WORKSPACE_UPDATE_KIND.WEEKLY,
          periodKey,
          windowStart,
          windowEnd: instant,
          actorUserId: null,
        },
        depsFor(config.workspaceId),
      );
      if (outcome.kind === "drafted") result.drafted.push(config.workspaceId);
      else if (outcome.kind === "empty") result.empty.push(config.workspaceId);
      else result.alreadyClaimed.push(config.workspaceId);
    } catch (err) {
      result.failed.push({ workspaceId: config.workspaceId, error: errorMessage(err) });
    }
  }

  return result;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

/** How long after approval a failed channel keeps being retried. */
export const DISTRIBUTION_RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const DISTRIBUTION_BATCH = 50;
/** Leave a fresh approval to its own distribution attempt (no concurrent sends). */
export const DISTRIBUTION_SETTLE_MS = 10 * 60 * 1000;

export interface RunDistributionsResult {
  retried: number;
  sent: string[];
  stillFailing: string[];
  errored: { updateId: string; error: string }[];
}

/**
 * Retry distribution for approved updates that have not finished (a channel
 * failed, or approval's own attempt never ran): each channel that already
 * succeeded is skipped, so this only re-runs what failed. Gives up after the
 * retry window — the per-channel failure stays recorded on the update.
 */
export async function runPendingDistributions(
  db: PrismaClient,
  now: Date,
  channels: DistributeChannels,
): Promise<RunDistributionsResult> {
  const pending = await db.workspaceUpdate.findMany({
    where: {
      status: WORKSPACE_UPDATE_STATUS.APPROVED,
      approvedAt: {
        gte: new Date(now.getTime() - DISTRIBUTION_RETRY_WINDOW_MS),
        lte: new Date(now.getTime() - DISTRIBUTION_SETTLE_MS),
      },
    },
    orderBy: { approvedAt: "asc" },
    take: DISTRIBUTION_BATCH,
    select: { id: true },
  });

  const result: RunDistributionsResult = { retried: pending.length, sent: [], stillFailing: [], errored: [] };
  for (const { id } of pending) {
    try {
      const outcome = await distributeWorkspaceUpdate(db, id, channels);
      if (outcome.kind === "sent") result.sent.push(id);
      else if (outcome.kind === "partial") result.stillFailing.push(id);
    } catch (err) {
      result.errored.push({ updateId: id, error: errorMessage(err) });
    }
  }
  return result;
}
