import type { PrismaClient } from "@prisma/client";
import { QUEUED_RETRY_AFTER_MS, RUN_HEARTBEAT_TIMEOUT_MS } from "./constants";
import { dispatchQueuedRuns, type DispatchResult } from "./dispatch";
import { appendRunEvent } from "./events";

export interface SweepResult {
  timedOut: string[];
  dispatch: DispatchResult;
}

/**
 * The minute cron (ADR-0067, Agent PRD D4): two safety nets behind the
 * `after()` kick.
 *
 *  1. **Timeout.** A RUNNING row whose heartbeat (`lastEventAt`, else
 *     `startedAt`) is older than five minutes is marked TIMED_OUT — the
 *     function that ran it died, or Mastra hung past `maxDuration`. The flag
 *     doubles as a cancel: callbacks refuse a non-RUNNING run and the
 *     dispatcher never overwrites a terminal status, so a zombie's late
 *     results are discarded.
 *  2. **Queued retry.** QUEUED rows older than a minute are dispatched here;
 *     the kick normally handles them in seconds, this catches a kick that was
 *     lost (CRON_SECRET missing, cold start timeout, deploy mid-request).
 */
export async function sweepAgentRuns(db: PrismaClient, now: Date): Promise<SweepResult> {
  const heartbeatCutoff = new Date(now.getTime() - RUN_HEARTBEAT_TIMEOUT_MS);
  const stale = await db.agentRun.findMany({
    where: {
      status: "RUNNING",
      OR: [
        { lastEventAt: { lt: heartbeatCutoff } },
        { lastEventAt: null, startedAt: { lt: heartbeatCutoff } },
      ],
    },
    select: { id: true },
  });

  const timedOut: string[] = [];
  for (const { id } of stale) {
    // Guard on status so a run that finished between the read and the write
    // keeps its real outcome.
    const result = await db.agentRun.updateMany({
      where: { id, status: "RUNNING" },
      data: {
        status: "TIMED_OUT",
        finishedAt: now,
        error: `No heartbeat for ${Math.round(RUN_HEARTBEAT_TIMEOUT_MS / 60000)} minutes`,
      },
    });
    if (result.count === 1) {
      timedOut.push(id);
      await appendRunEvent(db, { runId: id, kind: "status", payload: { status: "TIMED_OUT" } });
    }
  }

  const dispatch = await dispatchQueuedRuns(db, now, {
    queuedBefore: new Date(now.getTime() - QUEUED_RETRY_AFTER_MS),
  });

  return { timedOut, dispatch };
}
