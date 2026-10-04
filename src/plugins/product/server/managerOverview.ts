/**
 * Pure computations behind the product Overview "manager view"
 * (`product.getManagerOverview`). The router loads rows; everything here is
 * deterministic over those rows and `now`, so it is unit-testable without a DB.
 *
 * Derivations that stand in for data we do not store (no migrations):
 * - Cycle burn-up is rebuilt from the tickets currently in the cycle: a ticket
 *   joins the scope line at the later of the cycle start and the moment it
 *   entered the cycle; it joins the done line at `completedAt`. Tickets moved
 *   OUT of the cycle are not recoverable, so "removed" is not reported.
 * - "In review" is the QA status: in this workflow a ticket moves to QA when
 *   its PR opens and the merge hook moves it QA -> DONE.
 * - A ticket committed to a cycle is due at the cycle end; it is "slipping"
 *   when the product's median cycle time says it will not finish by then.
 */
import type { TicketStatus } from "~/lib/ticket-statuses";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export type StageKey = "committed" | "inProgress" | "inReview" | "done" | "deployed";

export const STAGE_ORDER: StageKey[] = [
  "committed",
  "inProgress",
  "inReview",
  "done",
  "deployed",
];

/** Statuses that mean "in the cycle but not started yet". */
const NOT_STARTED: ReadonlySet<string> = new Set([
  "BACKLOG",
  "NEEDS_REFINEMENT",
  "READY_TO_PLAN",
  "COMMITTED",
]);

export function stageOf(status: TicketStatus): StageKey | null {
  if (NOT_STARTED.has(status)) return "committed";
  if (status === "IN_PROGRESS" || status === "BLOCKED") return "inProgress";
  if (status === "QA") return "inReview";
  if (status === "DONE") return "done";
  if (status === "DEPLOYED") return "deployed";
  return null;
}

export interface StageTicket {
  id: string;
  stage: StageKey;
  /** ms the ticket has spent in its current stage (done: since completion). */
  ageMs: number;
  isAgent: boolean;
}

export interface StageSummary {
  key: StageKey;
  count: number;
  avgAgeMs: number;
  /** Per-ticket ages, oldest first; empty for "deployed". */
  agesMs: number[];
}

export function summarizeStages(tickets: StageTicket[]): StageSummary[] {
  return STAGE_ORDER.map((key) => {
    const inStage = tickets.filter((t) => t.stage === key);
    const ages = inStage.map((t) => t.ageMs).sort((a, b) => b - a);
    const avg = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : 0;
    return {
      key,
      count: inStage.length,
      avgAgeMs: avg,
      agesMs: key === "deployed" ? [] : ages,
    };
  });
}

export interface Bottleneck {
  stage: StageKey;
  count: number;
  avgAgeMs: number;
  agentCount: number;
}

const WAITING_STAGES: StageKey[] = ["inProgress", "inReview"];

/**
 * The in-flight stage holding the most accumulated waiting time, if it is
 * meaningfully stuck (at least 2 tickets averaging a day or more).
 */
export function findBottleneck(tickets: StageTicket[]): Bottleneck | null {
  let best: Bottleneck | null = null;
  let bestTotal = 0;
  for (const stage of WAITING_STAGES) {
    const inStage = tickets.filter((t) => t.stage === stage);
    if (inStage.length < 2) continue;
    const total = inStage.reduce((s, t) => s + t.ageMs, 0);
    const avg = total / inStage.length;
    if (avg < DAY || total <= bestTotal) continue;
    bestTotal = total;
    best = {
      stage,
      count: inStage.length,
      avgAgeMs: avg,
      agentCount: inStage.filter((t) => t.isAgent).length,
    };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Waiting on / WIP
// ---------------------------------------------------------------------------

export interface WaitingTicket {
  stage: StageKey;
  status: TicketStatus;
  isAgent: boolean;
}

export interface WaitingOn {
  /** In review (QA): waiting on a person to review. */
  people: number;
  /** In progress and assigned to an agent: waiting on the agent to build. */
  agents: number;
  /** BLOCKED: waiting on something else to finish first. */
  blocked: number;
}

export function computeWaitingOn(tickets: WaitingTicket[]): WaitingOn {
  let people = 0;
  let agents = 0;
  let blocked = 0;
  for (const t of tickets) {
    if (t.status === "BLOCKED") blocked += 1;
    else if (t.stage === "inReview") people += 1;
    else if (t.stage === "inProgress" && t.isAgent) agents += 1;
  }
  return { people, agents, blocked };
}

// ---------------------------------------------------------------------------
// Cycle burn-up
// ---------------------------------------------------------------------------

export interface BurnupTicket {
  /** When the ticket entered the cycle (createdAt or last cycle move). */
  addedAt: Date;
  /** Completion time when DONE/DEPLOYED, else null. */
  doneAt: Date | null;
}

export interface BurnupPoint {
  day: number; // 0-based day index from cycle start
  scope: number;
  done: number;
}

export interface Burnup {
  totalDays: number;
  /** 1-based "day N of totalDays", clamped to the cycle. */
  dayNumber: number;
  points: BurnupPoint[]; // day 0 .. today
  scopeNow: number;
  doneNow: number;
  idealToday: number;
  addedMidCycle: number;
  actualPerDay: number;
  neededPerDay: number;
  /** Days from cycle start at which the current rate reaches scope; null if no progress yet. */
  projectedFinishDay: number | null;
  /** Positive = finishes that many days before the cycle ends. */
  projectedDaysEarly: number | null;
}

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function computeBurnup(
  cycle: { startDate: Date; endDate: Date },
  tickets: BurnupTicket[],
  now: Date,
): Burnup {
  const start = startOfUtcDay(cycle.startDate);
  const end = startOfUtcDay(cycle.endDate);
  const totalDays = Math.max(1, Math.round((end - start) / DAY) + 1);
  const todayIndex = Math.min(
    totalDays - 1,
    Math.max(0, Math.floor((startOfUtcDay(now) - start) / DAY)),
  );

  const points: BurnupPoint[] = [];
  for (let day = 0; day <= todayIndex; day++) {
    const cutoff = start + (day + 1) * DAY; // end of that day
    points.push({
      day,
      scope: tickets.filter((t) => t.addedAt.getTime() < cutoff).length,
      done: tickets.filter((t) => t.doneAt && t.doneAt.getTime() < cutoff).length,
    });
  }

  const scopeNow = tickets.length;
  const doneNow = tickets.filter((t) => t.doneAt).length;
  const elapsed = todayIndex + 1;
  const remainingDays = totalDays - elapsed;
  const actualPerDay = doneNow / elapsed;
  const neededPerDay =
    remainingDays > 0 ? Math.max(0, scopeNow - doneNow) / remainingDays : 0;
  const addedMidCycle = tickets.filter(
    (t) => t.addedAt.getTime() >= start + DAY,
  ).length;

  let projectedFinishDay: number | null = null;
  let projectedDaysEarly: number | null = null;
  if (doneNow >= scopeNow && scopeNow > 0) {
    projectedFinishDay = todayIndex;
  } else if (actualPerDay > 0) {
    projectedFinishDay = todayIndex + (scopeNow - doneNow) / actualPerDay;
  }
  if (projectedFinishDay !== null) {
    projectedDaysEarly = Math.round(totalDays - 1 - projectedFinishDay);
  }

  return {
    totalDays,
    dayNumber: elapsed,
    points,
    scopeNow,
    doneNow,
    idealToday: Math.round(((scopeNow * elapsed) / totalDays) * 10) / 10,
    addedMidCycle,
    actualPerDay: Math.round(actualPerDay * 10) / 10,
    neededPerDay: Math.round(neededPerDay * 10) / 10,
    projectedFinishDay,
    projectedDaysEarly,
  };
}

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

export interface PathTicket {
  id: string;
  /** Remaining-work weight; points when estimated, else 1. */
  weight: number;
}

/** Edge direction: `blockerId` must finish before `ticketId`. */
export interface PathEdge {
  blockerId: string;
  ticketId: string;
}

/**
 * Longest chain of open tickets through "blocked by" links, weighted by
 * remaining work. Returned blocker-first. Only chains of 2+ tickets count.
 * Dependency cycles are prevented on write (wouldCreateCycle); a visited
 * guard keeps this safe anyway.
 */
export function computeCriticalPath(
  tickets: PathTicket[],
  edges: PathEdge[],
): string[] {
  const weight = new Map(tickets.map((t) => [t.id, t.weight]));
  const blockersOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!weight.has(e.blockerId) || !weight.has(e.ticketId)) continue;
    const list = blockersOf.get(e.ticketId) ?? [];
    list.push(e.blockerId);
    blockersOf.set(e.ticketId, list);
  }

  const best = new Map<string, { score: number; prev: string | null }>();
  const visiting = new Set<string>();
  const solve = (id: string): number => {
    const known = best.get(id);
    if (known) return known.score;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let prev: string | null = null;
    let prevScore = 0;
    for (const b of blockersOf.get(id) ?? []) {
      const s = solve(b);
      if (s > prevScore) {
        prevScore = s;
        prev = b;
      }
    }
    visiting.delete(id);
    const score = (weight.get(id) ?? 1) + prevScore;
    best.set(id, { score, prev });
    return score;
  };

  let endId: string | null = null;
  let endScore = 0;
  for (const t of tickets) {
    const s = solve(t.id);
    if (s > endScore && blockersOf.has(t.id)) {
      endScore = s;
      endId = t.id;
    }
  }
  if (!endId) return [];

  const chain: string[] = [];
  let cur: string | null = endId;
  while (cur && !chain.includes(cur)) {
    chain.unshift(cur);
    cur = best.get(cur)?.prev ?? null;
  }
  return chain.length >= 2 ? chain : [];
}

// ---------------------------------------------------------------------------
// Slipping (cycle end date as the due date)
// ---------------------------------------------------------------------------

/** Fewer completed tickets than this and the median is too noisy to use. */
export const MIN_CYCLE_TIME_SAMPLES = 3;

/**
 * Whether an open ticket committed to a cycle is expected to miss the cycle
 * end. Remaining work is estimated from the product's median cycle time
 * (in progress -> done): a not-started ticket needs the full median; a
 * started one needs what is left of it, but never less than a quarter of it
 * (a ticket past the median is not "almost done"). Review is waiting time,
 * not building time, and is flagged separately ("No review").
 */
export function isSlipping(
  stage: StageKey,
  ageMs: number,
  medianCycleMs: number | null,
  msUntilDue: number,
): boolean {
  if (medianCycleMs === null) return false;
  if (stage === "committed") return medianCycleMs > msUntilDue;
  if (stage === "inProgress") {
    const remaining = Math.max(medianCycleMs - ageMs, medianCycleMs / 4);
    return remaining > msUntilDue;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
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
      count: completedAt.filter((d) => d.getTime() >= from && d.getTime() < to)
        .length,
    });
  }
  return out;
}

/** "github.com/acme/app/pull/418" -> { repo: "acme/app", number: 418 }. */
export function parsePrUrl(url: string): { repo: string; number: number } | null {
  const m = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(url);
  return m ? { repo: m[1]!, number: Number(m[2]) } : null;
}
