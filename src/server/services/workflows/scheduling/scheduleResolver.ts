/**
 * Pure scheduling logic for the **`scheduled` Automation trigger**
 * (CONTEXT.md → Broadcast / Automation; [ADR-0029](../../../../../docs/adr/0029-automation-platform-primitive.md)).
 *
 * This module is deliberately free of Prisma, network, and `Date.now()` — the
 * caller passes `now` — so the "which definitions are due, and exactly once per
 * period" logic is unit-testable in isolation. The thin cron route
 * (`run-scheduled-automations`) is the only impure caller.
 *
 * v1 cadence is a simple daily/weekly + hour in **UTC** (no full cron-expression
 * parsing, no per-recipient timezone — see the PRD "Out of scope").
 */

export type Cadence =
  | { kind: "daily"; hour: number }
  | { kind: "weekly"; hour: number; weekday: number }; // weekday: 0=Sun … 6=Sat

export interface ScheduledDefinition {
  id: string;
  isActive: boolean;
  cadence: Cadence;
  /** When this definition last completed a run; null if it has never run. */
  lastRunAt: Date | null;
}

function startOfUtcDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}

/**
 * The trigger instant for the period `now` falls into — the most recent moment
 * at/before `now` when this cadence should have fired. A definition is "due for
 * this period" once `now` reaches this instant and it hasn't run since.
 *
 * - daily:  today at `hour:00:00` UTC (or, if `now` is before that hour today,
 *           the boundary is still today's hour — `now < instant` makes it not due).
 * - weekly: the `weekday` of the current ISO-agnostic week at `hour:00:00` UTC.
 */
export function currentTriggerInstant(cadence: Cadence, now: Date): Date {
  if (cadence.kind === "daily") {
    const instant = startOfUtcDay(now);
    instant.setUTCHours(cadence.hour);
    return instant;
  }

  // weekly: walk back from `now` to the most recent `weekday` at `hour`.
  const candidate = startOfUtcDay(now);
  candidate.setUTCHours(cadence.hour);
  const dayDelta = (candidate.getUTCDay() - cadence.weekday + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() - dayDelta);
  // If walking back zero days but the hour today hasn't arrived, the instant is
  // still this week's weekday@hour; `now < instant` will render it not-due.
  return candidate;
}

/**
 * Stable key for the `(definitionId, period)` idempotency guard. The cron route
 * pairs this with a unique write so a concurrent double-fire can't both run.
 */
export function periodKey(cadence: Cadence, now: Date): string {
  const instant = currentTriggerInstant(cadence, now);
  return `${cadence.kind}:${instant.toISOString()}`;
}

/**
 * A definition is due when it is active, `now` has reached the current period's
 * trigger instant, and it has not already run during this period.
 *
 * Idempotency rests entirely on `lastRunAt`: after a successful run the engine
 * sets `lastRunAt = now (>= instant)`, so a re-sweep in the same period sees
 * `lastRunAt >= instant` and skips it.
 */
export function isDue(def: ScheduledDefinition, now: Date): boolean {
  if (!def.isActive) return false;
  const instant = currentTriggerInstant(def.cadence, now);
  if (now.getTime() < instant.getTime()) return false;
  if (def.lastRunAt && def.lastRunAt.getTime() >= instant.getTime()) {
    return false;
  }
  return true;
}

export function resolveDueDefinitions<T extends ScheduledDefinition>(
  definitions: T[],
  now: Date,
): T[] {
  return definitions.filter((d) => isDue(d, now));
}

/**
 * Read a `Cadence` out of a `WorkflowDefinition.config` JSON blob, under the
 * `schedule` key. Returns null for anything malformed so the runner can skip a
 * misconfigured definition rather than throw the whole sweep.
 *
 * Shape: `{ schedule: { kind: "daily", hour } }` or
 *        `{ schedule: { kind: "weekly", hour, weekday } }` (hour 0-23, weekday 0-6).
 */
export function parseCadence(config: unknown): Cadence | null {
  if (!config || typeof config !== "object") return null;
  const schedule = (config as Record<string, unknown>).schedule;
  if (!schedule || typeof schedule !== "object") return null;
  const o = schedule as Record<string, unknown>;
  const hour = typeof o.hour === "number" ? o.hour : null;
  if (hour === null || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }
  if (o.kind === "daily") return { kind: "daily", hour };
  if (o.kind === "weekly") {
    const weekday = typeof o.weekday === "number" ? o.weekday : null;
    if (
      weekday === null ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6
    ) {
      return null;
    }
    return { kind: "weekly", hour, weekday };
  }
  return null;
}
