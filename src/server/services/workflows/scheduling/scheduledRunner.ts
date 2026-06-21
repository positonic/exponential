import { type PrismaClient } from "@prisma/client";

import { WorkflowEngine } from "../WorkflowEngine";
import { createStepRegistry } from "../StepRegistry";
import { SCHEDULED_TRIGGER } from "../TriggerRegistry";
import {
  parseCadence,
  currentTriggerInstant,
  isDue,
  type ScheduledDefinition,
} from "./scheduleResolver";

/**
 * Impure runner for `scheduled` Automations — the thin orchestration around the
 * pure `scheduleResolver` ([ADR-0029](../../../../../docs/adr/0029-automation-platform-primitive.md)).
 * Called by the `run-scheduled-automations` cron route; not exported to clients.
 *
 * Idempotency is enforced with an **atomic claim** on the existing `lastRunAt`
 * column (no new schema): a conditional `updateMany` advances `lastRunAt` to the
 * current period only if it hasn't already advanced. A concurrent second sweep
 * sees `claim.count === 0` and skips — so `(definition, period)` runs at most
 * once even under a double-fire.
 */
export interface RunScheduledResult {
  evaluated: number;
  due: number;
  ran: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
}

export async function runDueScheduledAutomations(
  db: PrismaClient,
  now: Date,
): Promise<RunScheduledResult> {
  const rows = await db.workflowDefinition.findMany({
    where: { isActive: true, triggerType: SCHEDULED_TRIGGER },
    select: { id: true, config: true, lastRunAt: true },
  });

  const result: RunScheduledResult = {
    evaluated: rows.length,
    due: 0,
    ran: [],
    skipped: [],
    failed: [],
  };

  const engine = new WorkflowEngine(db, createStepRegistry(db));

  for (const row of rows) {
    const cadence = parseCadence(row.config);
    if (!cadence) {
      // Misconfigured cadence — skip, don't fail the whole sweep.
      result.skipped.push(row.id);
      continue;
    }

    const def: ScheduledDefinition = {
      id: row.id,
      isActive: true,
      cadence,
      lastRunAt: row.lastRunAt,
    };
    if (!isDue(def, now)) continue;
    result.due++;

    const instant = currentTriggerInstant(cadence, now);

    // Atomic per-(definition, period) claim via the existing lastRunAt column.
    const claim = await db.workflowDefinition.updateMany({
      where: {
        id: row.id,
        OR: [{ lastRunAt: null }, { lastRunAt: { lt: instant } }],
      },
      data: { lastRunAt: now },
    });
    if (claim.count === 0) {
      // Another concurrent sweep already claimed this period.
      result.skipped.push(row.id);
      continue;
    }

    try {
      await engine.execute(row.id, undefined, {
        scheduledFor: instant.toISOString(),
      });
      result.ran.push(row.id);
    } catch (err) {
      result.failed.push({
        id: row.id,
        error: err instanceof Error ? err.message : "Unknown run error",
      });
    }
  }

  return result;
}
