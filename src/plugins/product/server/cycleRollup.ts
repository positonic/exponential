import { COMPLETED_TICKET_STATUSES, STATUS_ORDER } from "~/lib/ticket-statuses";

/**
 * The "current cycle" numbers, computed once and shared by every surface
 * that shows them — the product overview's cycle hero (`product.getOverview`
 * + `CycleHero`) and the Daily summary — so they can never disagree
 * (one-source-of-truth pattern, ADR-0059 / ADR-0034 lineage).
 *
 * Pure: takes the cycle row and its tickets, reads no clock (callers pass
 * `now` to {@link computeCyclePacing}).
 */

export interface RollupCycle {
  id: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
}

export interface RollupTicket {
  id: string;
  shortId: string | null;
  number: number;
  title: string;
  status: string;
  points: number | null;
  assigneeId: string | null;
}

export interface CycleRollup extends RollupCycle {
  /** Points weighting when any ticket in the cycle carries points, else ticket count. */
  usesPoints: boolean;
  committed: number;
  completed: number;
  inProgress: number;
  /** One entry per status present, in workflow order. */
  statusCounts: { status: string; count: number }[];
  /** The caller's tickets in the cycle, workflow order, capped. */
  myTickets: {
    id: string;
    shortId: string | null;
    number: number;
    title: string;
    status: string;
  }[];
}

export interface CycleRollupOptions {
  userId: string;
  /** Cap on `myTickets` (the overview hero shows four). */
  myTicketsLimit?: number;
}

const statusRank = (s: string) => STATUS_ORDER[s] ?? 99;

export function computeCycleRollup(
  cycle: RollupCycle,
  tickets: RollupTicket[],
  { userId, myTicketsLimit = 4 }: CycleRollupOptions,
): CycleRollup {
  const completedSet = new Set<string>(COMPLETED_TICKET_STATUSES);
  const usesPoints = tickets.some((t) => (t.points ?? 0) > 0);
  const weight = (t: { points: number | null }) =>
    usesPoints ? (t.points ?? 0) : 1;

  const committed = tickets.reduce((s, t) => s + weight(t), 0);
  const completed = tickets
    .filter((t) => completedSet.has(t.status))
    .reduce((s, t) => s + weight(t), 0);
  const inProgress = tickets
    .filter((t) => t.status === "IN_PROGRESS")
    .reduce((s, t) => s + weight(t), 0);

  const counts = new Map<string, number>();
  for (const t of tickets) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);

  const myTickets = tickets
    .filter((t) => t.assigneeId === userId)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
    .slice(0, myTicketsLimit)
    .map(({ id, shortId, number, title, status }) => ({
      id,
      shortId,
      number,
      title,
      status,
    }));

  return {
    id: cycle.id,
    name: cycle.name,
    status: cycle.status,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    usesPoints,
    committed,
    completed,
    inProgress,
    statusCounts: Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => statusRank(a.status) - statusRank(b.status)),
    myTickets,
  };
}

export type CyclePace = "ahead" | "ontrack" | "behind";

export interface CyclePacing {
  /** Whole days until the cycle ends (ceil); negative once over; null without an end date. */
  daysLeft: number | null;
  over: boolean;
  /** 0–100 share of committed work done. */
  donePct: number;
  /** 0–100 share of committed work done or in progress. */
  progPct: number;
  /** 0–100 share of the cycle window elapsed; null without both dates. */
  timePct: number | null;
  /**
   * ahead when done ≥ elapsed + 15, on pace when done + 1 ≥ elapsed, else
   * behind; null when the window is unknown.
   */
  pace: CyclePace | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

const toMs = (d: Date | string | null | undefined): number | null =>
  d ? new Date(d).getTime() : null;

/**
 * Time-vs-work pacing for a cycle at `now`. Pure and clock-free; the hero
 * passes `Date.now()`, the Daily summary passes the fire instant.
 */
export function computeCyclePacing(
  cycle: {
    startDate: Date | string | null;
    endDate: Date | string | null;
    committed: number;
    completed: number;
    inProgress: number;
  },
  now: Date | number,
): CyclePacing {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const start = toMs(cycle.startDate);
  const end = toMs(cycle.endDate);

  const daysLeft = end !== null ? Math.ceil((end - nowMs) / DAY_MS) : null;
  const over = daysLeft !== null && daysLeft < 0;

  const donePct =
    cycle.committed > 0
      ? clamp((cycle.completed / cycle.committed) * 100, 0, 100)
      : 0;
  const progPct =
    cycle.committed > 0
      ? clamp(
          ((cycle.completed + cycle.inProgress) / cycle.committed) * 100,
          0,
          100,
        )
      : 0;
  const timePct =
    start !== null && end !== null && end > start
      ? clamp(((nowMs - start) / (end - start)) * 100, 0, 100)
      : null;

  const pace: CyclePace | null =
    timePct === null
      ? null
      : donePct >= timePct + 15
        ? "ahead"
        : donePct + 1 >= timePct
          ? "ontrack"
          : "behind";

  return { daysLeft, over, donePct, progPct, timePct, pace };
}
