/**
 * Delivery-flow metrics shared by the product Overview and the Metrics page.
 *
 * Everything here is a pure computation over ticket rows and their
 * `WorkspaceActivityEvent` status moves: when a ticket was started and
 * finished, how many finished per week (throughput) and how long they took
 * (cycle time). The two surfaces call the SAME functions so their numbers can
 * never drift — the ADR-0047 principle, applied to flow metrics.
 *
 * Why events and not `Ticket.completedAt`: until prime.swan (ticket 689) the column
 * was re-stamped on every completed-status save, so it read as "last edited
 * at". The event log records each real transition. `completedAt` is only a
 * fallback for tickets that have no status event at all (created straight
 * into DONE, or older than the log).
 */

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Fewer completed tickets than this and a percentile is too noisy to show. */
export const MIN_CYCLE_TIME_SAMPLES = 3;

const COMPLETED: ReadonlySet<string> = new Set(["DONE", "DEPLOYED"]);

export interface StatusMove {
  ticketId: string;
  to: string;
  at: Date;
}

export function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Start of the trailing `weeks`-week window that ends at the end of today (UTC). */
export function flowWindowStart(now: Date, weeks: number): Date {
  return new Date(startOfUtcDay(now) + DAY - weeks * 7 * DAY);
}

/**
 * `WorkspaceActivityEvent` rows (entityType "ticket", action "status_changed")
 * as status moves. Rows whose metadata carries no `to` are skipped.
 */
export function statusMovesFromEvents(
  events: { entityId: string; metadata: unknown; createdAt: Date }[],
): StatusMove[] {
  const moves: StatusMove[] = [];
  for (const e of events) {
    const to = (e.metadata as { to?: unknown } | null)?.to;
    if (typeof to === "string") moves.push({ ticketId: e.entityId, to, at: e.createdAt });
  }
  return moves;
}

/**
 * When each ticket was finished: the first move into DONE/DEPLOYED after its
 * last reopen. Events must be oldest first.
 */
export function finishedAtFromEvents(events: StatusMove[]): Map<string, Date> {
  const finished = new Map<string, Date>();
  for (const e of events) {
    if (COMPLETED.has(e.to)) {
      if (!finished.has(e.ticketId)) finished.set(e.ticketId, e.at);
    } else {
      finished.delete(e.ticketId);
    }
  }
  return finished;
}

/**
 * When each ticket was started: its first move into IN_PROGRESS. A reopened
 * ticket keeps its original start, so its cycle time spans the rework too.
 * Events must be oldest first.
 */
export function startedAtFromEvents(events: StatusMove[]): Map<string, Date> {
  const started = new Map<string, Date>();
  for (const e of events) {
    if (e.to === "IN_PROGRESS" && !started.has(e.ticketId)) started.set(e.ticketId, e.at);
  }
  return started;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The p-th percentile (0..1) by linear interpolation between the two nearest
 * ranks, so `percentile(v, 0.5)` equals `median(v)`. Null for no values.
 */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Completed tickets per week, oldest first, for the last `weeks` weeks. */
export function weeklyCompleted(
  completedAt: Date[],
  now: Date,
  weeks = 12,
): { weekStart: Date; count: number }[] {
  const endOfToday = startOfUtcDay(now) + DAY;
  const out: { weekStart: Date; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = endOfToday - (i + 1) * 7 * DAY;
    const to = from + 7 * DAY;
    out.push({
      weekStart: new Date(from),
      count: completedAt.filter((d) => d.getTime() >= from && d.getTime() < to).length,
    });
  }
  return out;
}

/**
 * Cycle times (ms, started -> finished) for the tickets that have both a
 * start event and a finish time. Non-positive spans are dropped.
 */
export function cycleTimesMs(
  tickets: { id: string; finishedAt: Date | null }[],
  startedAt: ReadonlyMap<string, Date>,
): number[] {
  return tickets.flatMap((t) => {
    const start = startedAt.get(t.id);
    if (!start || !t.finishedAt) return [];
    const ms = t.finishedAt.getTime() - start.getTime();
    return ms > 0 ? [ms] : [];
  });
}

export interface DeliveryFlowTicket {
  id: string;
  status: string;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface DeliveryFlowResult {
  weeks: number;
  /** Oldest first, one entry per week ending today. */
  throughput: { weekStart: Date; completed: number }[];
  /** Completed in the window, summed over `throughput`. */
  completedInWindow: number;
  /** Average completed per week over the most recent 4 weeks. */
  recentWeeklyAverage: number;
  cycleTime: {
    p50Hours: number | null;
    p85Hours: number | null;
    /** Completed tickets in the window with a recorded start. */
    sampleSize: number;
  };
  /** How many of the window's completions were dated by an event (vs. fallback). */
  datedByEvents: number;
}

/**
 * Throughput and cycle time over the trailing `weeks` weeks (ending today).
 *
 * A ticket's finish time is its event-log finish, else `completedAt`, else
 * `updatedAt` — the same fallback chain the Overview uses, so the two agree.
 * Only DONE/DEPLOYED tickets count; a ticket finished before the window is
 * ignored even if it was edited inside it.
 */
export function computeDeliveryFlow(
  tickets: DeliveryFlowTicket[],
  moves: StatusMove[],
  now: Date,
  weeks = 12,
): DeliveryFlowResult {
  const finished = finishedAtFromEvents(moves);
  const started = startedAtFromEvents(moves);
  const endOfToday = startOfUtcDay(now) + DAY;
  const windowStart = flowWindowStart(now, weeks).getTime();

  const inWindow: { id: string; finishedAt: Date; byEvent: boolean }[] = [];
  for (const t of tickets) {
    if (!COMPLETED.has(t.status)) continue;
    const byEvent = finished.get(t.id);
    const at = byEvent ?? t.completedAt ?? t.updatedAt;
    const ms = at.getTime();
    if (ms >= windowStart && ms < endOfToday) {
      inWindow.push({ id: t.id, finishedAt: at, byEvent: byEvent !== undefined });
    }
  }

  const throughput = weeklyCompleted(
    inWindow.map((t) => t.finishedAt),
    now,
    weeks,
  ).map((w) => ({ weekStart: w.weekStart, completed: w.count }));
  const recent = throughput.slice(-4);
  const recentWeeklyAverage =
    recent.length > 0 ? recent.reduce((s, w) => s + w.completed, 0) / recent.length : 0;

  const times = cycleTimesMs(inWindow, started);
  const enough = times.length >= MIN_CYCLE_TIME_SAMPLES;
  const hours = (ms: number | null) => (ms === null ? null : ms / HOUR);

  return {
    weeks,
    throughput,
    completedInWindow: inWindow.length,
    recentWeeklyAverage,
    cycleTime: {
      p50Hours: enough ? hours(percentile(times, 0.5)) : null,
      p85Hours: enough ? hours(percentile(times, 0.85)) : null,
      sampleSize: times.length,
    },
    datedByEvents: inWindow.filter((t) => t.byEvent).length,
  };
}
