import type { PrismaClient } from "@prisma/client";

import { generateWorkspaceUpdate, type GenerateDeps, type GenerateResult } from "./generate";
import { dueWeeklyInstant, weeklyPeriodKey } from "./schedule";
import { WORKSPACE_UPDATE_KIND } from "./types";
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
