import { type PrismaClient, type ActionStatus } from "@prisma/client";
import { db } from "~/server/db";

export interface SprintMetricsResult {
  sprintId: string;
  sprintName: string;
  startDate: Date | null;
  endDate: Date | null;
  // Velocity
  plannedEffort: number;
  completedEffort: number;
  velocity: number;
  // Throughput
  plannedActions: number;
  completedActions: number;
  addedActions: number; // scope creep
  // Kanban counts
  kanbanCounts: Record<string, number>;
  // Completion
  completionRate: number;
}

export interface BurndownPoint {
  date: Date;
  remainingEffort: number;
  idealRemaining: number;
  completedEffort: number;
}

export interface RiskSignal {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  actionIds?: string[];
}

export interface DailySnapshotResult {
  snapshotId: string;
  date: Date;
  kanbanCounts: Record<string, number>;
  actionsCompleted: number;
}

/**
 * Cycle metrics computed over the cycle's **Tickets** (`Ticket.cycleId`) — the
 * entity the product workflow actually tracks cycle work with. Distinct from
 * the Action-based {@link SprintMetricsResult} the Mastra PM agent reads; see
 * ADR-0047 for why the Metrics page is Ticket-based.
 */
export interface CycleTicketMetricsResult {
  cycleId: string;
  cycleName: string;
  startDate: Date | null;
  endDate: Date | null;
  totalTickets: number;
  /** Tickets in a completed state ({@link COMPLETED_TICKET_STATUSES}). */
  completedTickets: number;
  /** Summed `Ticket.points` for completed tickets (points are optional/sparse). */
  completedPoints: number;
  totalPoints: number;
  /** completedTickets / totalTickets, as a percentage. */
  completionRate: number;
  /** Count of tickets by `TicketStatus`. */
  statusCounts: Record<string, number>;
}

export interface CycleSummary {
  id: string;
  name: string;
  status: string; // ListStatus (ACTIVE / COMPLETED / PLANNED / …)
  startDate: Date | null;
  endDate: Date | null;
}

export interface CycleVelocityPoint {
  cycleId: string;
  cycleName: string;
  endDate: Date | null;
  completedTickets: number;
  completedPoints: number;
  completionRate: number;
}

/**
 * Ticket statuses that count as delivered work for velocity/completion.
 * Both are terminal/shipped states in the product workflow.
 */
const COMPLETED_TICKET_STATUSES = new Set<string>(["DONE", "DEPLOYED"]);

export interface PrTurnaroundResult {
  /** PRs merged within the cycle window (deduped by repo + PR number). */
  mergedPrCount: number;
  /** Avg opened→merged time in hours, over PRs with a known opened event. Null when none are measurable. */
  avgHours: number | null;
  /** Median opened→merged time in hours. Null when none are measurable. */
  medianHours: number | null;
}

/**
 * One cycle's roll-up in the all-cycles view: the same Ticket-based numbers as
 * {@link CycleTicketMetricsResult}, plus that cycle's merged-PR turnaround, so
 * a single request can plot every metric against every cycle.
 */
export interface CycleMetricsPoint {
  cycleId: string;
  cycleName: string;
  status: string; // ListStatus (ACTIVE / COMPLETED / PLANNED / …)
  startDate: Date | null;
  endDate: Date | null;
  totalTickets: number;
  completedTickets: number;
  completedPoints: number;
  totalPoints: number;
  completionRate: number;
  mergedPrCount: number;
  /** Avg opened→merged hours for PRs merged in this cycle's window. */
  avgPrHours: number | null;
}

/**
 * Workspace-wide metrics across **all** cycles: the summed/overall figures for
 * the headline, plus the per-cycle series behind them.
 */
export interface AllCyclesMetricsResult {
  /** Number of cycles in the series (i.e. cycles that hold at least one ticket). */
  cycleCount: number;
  totalTickets: number;
  completedTickets: number;
  completedPoints: number;
  totalPoints: number;
  /** Overall completedTickets / totalTickets, as a percentage. */
  completionRate: number;
  /** PRs merged inside any cycle window, deduped across overlapping windows. */
  mergedPrCount: number;
  avgPrHours: number | null;
  medianPrHours: number | null;
  /** Chronological, oldest → newest, for the trend chart. */
  cycles: CycleMetricsPoint[];
}

/** A merged PR with its opened→merged duration, when measurable. */
interface MergedPrDuration {
  /** `${repoFullName}#${prNumber}` — the dedup key. */
  key: string;
  mergedAt: Date;
  /** Null when no `opened` event was captured for the PR. */
  hours: number | null;
}

export interface VelocityHistoryPoint {
  sprintId: string;
  sprintName: string;
  endDate: Date | null;
  // Velocity, reported as both a count (headline) and points, consistent
  // with the active-cycle metrics.
  completedActions: number;
  completedEffort: number;
  velocity: number; // = completedEffort (points); kept for agent compatibility
  completionRate: number;
}

const KANBAN_STATUSES: ActionStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
];

/**
 * Reduce a set of merged PRs to count + avg/median turnaround. PRs without a
 * measurable duration still count toward `mergedPrCount`; avg/median stay null
 * when none are measurable (no NaN from an empty average).
 */
function summarizePrDurations(prs: MergedPrDuration[]): PrTurnaroundResult {
  const durations = prs
    .map((pr) => pr.hours)
    .filter((h): h is number => h != null);

  if (durations.length === 0) {
    return { mergedPrCount: prs.length, avgHours: null, medianHours: null };
  }

  const avgHours = durations.reduce((sum, h) => sum + h, 0) / durations.length;

  const sorted = [...durations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianHours =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;

  return { mergedPrCount: prs.length, avgHours, medianHours };
}

export class SprintAnalyticsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get metrics for an active sprint (List with type=SPRINT).
   */
  async getSprintMetrics(listId: string): Promise<SprintMetricsResult> {
    const list = await this.prisma.list.findUniqueOrThrow({
      where: { id: listId },
      include: {
        actions: {
          include: {
            action: {
              select: {
                id: true,
                kanbanStatus: true,
                effortEstimate: true,
              },
            },
          },
        },
      },
    });

    // Map list-action entries to include both the action data and the list-join createdAt
    const actionEntries = list.actions.map((al) => ({
      ...al.action,
      addedToListAt: al.createdAt,
    }));

    const kanbanCounts: Record<string, number> = {};
    for (const status of KANBAN_STATUSES) {
      kanbanCounts[status] = actionEntries.filter(
        (a) => a.kanbanStatus === status,
      ).length;
    }

    const totalEffort = actionEntries.reduce(
      (sum: number, a) => sum + (a.effortEstimate ?? 0),
      0,
    );
    const completedEffort = actionEntries
      .filter((a) => a.kanbanStatus === "DONE")
      .reduce((sum: number, a) => sum + (a.effortEstimate ?? 0), 0);

    const completedActions = actionEntries.filter(
      (a) => a.kanbanStatus === "DONE",
    ).length;

    // Scope creep: actions added to the list after sprint start date
    let addedActions = 0;
    if (list.startDate) {
      addedActions = actionEntries.filter(
        (a) => a.addedToListAt > list.startDate!,
      ).length;
    }

    const plannedActions = actionEntries.length - addedActions;
    const completionRate =
      plannedActions > 0
        ? (completedActions / plannedActions) * 100
        : 0;

    return {
      sprintId: list.id,
      sprintName: list.name,
      startDate: list.startDate,
      endDate: list.endDate,
      plannedEffort: totalEffort - actionEntries
        .filter((a) => list.startDate && a.addedToListAt > list.startDate)
        .reduce((sum: number, a) => sum + (a.effortEstimate ?? 0), 0),
      completedEffort,
      velocity: completedEffort,
      plannedActions,
      completedActions,
      addedActions,
      kanbanCounts,
      completionRate,
    };
  }

  /**
   * Get burndown data from sprint snapshots.
   */
  async getBurndownData(listId: string): Promise<BurndownPoint[]> {
    const list = await this.prisma.list.findUniqueOrThrow({
      where: { id: listId },
      select: { startDate: true, endDate: true },
    });

    const snapshots = await this.prisma.sprintSnapshot.findMany({
      where: { listId },
      orderBy: { snapshotDate: "asc" },
    });

    if (snapshots.length === 0 || !list.startDate || !list.endDate) {
      return [];
    }

    const totalDays = Math.ceil(
      (list.endDate.getTime() - list.startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const firstSnapshot = snapshots[0]!;
    const initialEffort = firstSnapshot.totalEffort;

    return snapshots.map((snap) => {
      const dayIndex = Math.ceil(
        (snap.snapshotDate.getTime() - list.startDate!.getTime()) / (1000 * 60 * 60 * 24),
      );
      const idealRemaining =
        totalDays > 0
          ? initialEffort * (1 - dayIndex / totalDays)
          : 0;

      return {
        date: snap.snapshotDate,
        remainingEffort: snap.totalEffort - snap.completedEffort,
        idealRemaining: Math.max(0, idealRemaining),
        completedEffort: snap.completedEffort,
      };
    });
  }

  /**
   * Detect risk signals for a sprint.
   */
  async detectRiskSignals(listId: string): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];
    const metrics = await this.getSprintMetrics(listId);

    // Scope creep: >20% of actions added after sprint start
    if (metrics.plannedActions > 0) {
      const creepRate = metrics.addedActions / (metrics.plannedActions + metrics.addedActions);
      if (creepRate > 0.2) {
        signals.push({
          type: "scope_creep",
          severity: creepRate > 0.4 ? "high" : "medium",
          message: `${metrics.addedActions} actions (${Math.round(creepRate * 100)}%) added after sprint start`,
        });
      }
    }

    // Stale items: IN_PROGRESS for 3+ days with no status change
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const list = await this.prisma.list.findUniqueOrThrow({
      where: { id: listId },
      include: {
        actions: {
          include: {
            action: {
              select: {
                id: true,
                name: true,
                kanbanStatus: true,
                dueDate: true,
                blockedByIds: true,
                statusChanges: {
                  orderBy: { changedAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const staleActions = list.actions
      .map((al) => al.action)
      .filter((a) => {
        if (a.kanbanStatus !== "IN_PROGRESS") return false;
        const lastChange = a.statusChanges[0];
        if (!lastChange) return true; // No recorded change = potentially stale
        return lastChange.changedAt < threeDaysAgo;
      });

    if (staleActions.length > 0) {
      signals.push({
        type: "stale_items",
        severity: staleActions.length > 3 ? "high" : "medium",
        message: `${staleActions.length} action(s) stuck in IN_PROGRESS for 3+ days`,
        actionIds: staleActions.map((a) => a.id),
      });
    }

    // Overdue: actions past due date
    const now = new Date();
    const overdueActions = list.actions
      .map((al) => al.action)
      .filter((a) => {
        return a.kanbanStatus !== "DONE" && a.kanbanStatus !== "CANCELLED" && a.dueDate != null && a.dueDate < now;
      });

    if (overdueActions.length > 0) {
      signals.push({
        type: "overdue",
        severity: overdueActions.length > 5 ? "high" : "medium",
        message: `${overdueActions.length} action(s) are past their due date`,
        actionIds: overdueActions.map((a) => a.id),
      });
    }

    // Blocked items
    const blockedActions = list.actions
      .map((al) => al.action)
      .filter((a) => {
        return a.kanbanStatus !== "DONE" && a.kanbanStatus !== "CANCELLED" && a.blockedByIds.length > 0;
      });

    if (blockedActions.length > 0) {
      signals.push({
        type: "blocked",
        severity: blockedActions.length > 3 ? "high" : "medium",
        message: `${blockedActions.length} action(s) are blocked by dependencies`,
        actionIds: blockedActions.map((a) => a.id),
      });
    }

    // Low completion rate with sprint > 50% elapsed
    if (metrics.startDate && metrics.endDate) {
      const totalDuration = metrics.endDate.getTime() - metrics.startDate.getTime();
      const elapsed = now.getTime() - metrics.startDate.getTime();
      const percentElapsed = elapsed / totalDuration;

      if (percentElapsed > 0.5 && metrics.completionRate < 30) {
        signals.push({
          type: "velocity_drop",
          severity: "high",
          message: `Sprint is ${Math.round(percentElapsed * 100)}% elapsed but only ${Math.round(metrics.completionRate)}% complete`,
        });
      }
    }

    return signals;
  }

  /**
   * Capture a daily snapshot of the sprint for burndown tracking.
   */
  async captureDailySnapshot(listId: string): Promise<DailySnapshotResult> {
    const metrics = await this.getSprintMetrics(listId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get GitHub activity for today
    const githubActivity = await this.prisma.gitHubActivity.count({
      where: {
        eventTimestamp: { gte: today },
      },
    });

    const prActivity = await this.prisma.gitHubActivity.groupBy({
      by: ["eventAction"],
      where: {
        eventType: "pull_request",
        eventTimestamp: { gte: today },
      },
      _count: true,
    });

    const prsOpened = prActivity.find((p) => p.eventAction === "opened")?._count ?? 0;
    const prsMerged = prActivity.find(
      (p) => p.eventAction === "closed",
    )?._count ?? 0; // merged PRs come as "closed" with merged_at set

    const reviewCount = await this.prisma.gitHubActivity.count({
      where: {
        eventType: "pull_request_review",
        eventTimestamp: { gte: today },
      },
    });

    const counts = metrics.kanbanCounts;
    const snapshotData = {
      backlogCount: counts.BACKLOG ?? 0,
      todoCount: counts.TODO ?? 0,
      inProgressCount: counts.IN_PROGRESS ?? 0,
      inReviewCount: counts.IN_REVIEW ?? 0,
      doneCount: counts.DONE ?? 0,
      cancelledCount: counts.CANCELLED ?? 0,
      totalEffort: metrics.plannedEffort + metrics.completedEffort,
      completedEffort: metrics.completedEffort,
      actionsCompleted: metrics.completedActions,
      commitsCount: githubActivity,
      prsOpened,
      prsMerged,
      prsReviewed: reviewCount,
    };

    const snapshot = await this.prisma.sprintSnapshot.upsert({
      where: {
        listId_snapshotDate: {
          listId,
          snapshotDate: today,
        },
      },
      create: {
        listId,
        snapshotDate: today,
        addedEffort: 0,
        ...snapshotData,
      },
      update: snapshotData,
    });

    return {
      snapshotId: snapshot.id,
      date: snapshot.snapshotDate,
      kanbanCounts: metrics.kanbanCounts,
      actionsCompleted: metrics.completedActions,
    };
  }

  /**
   * Get the active sprint for a workspace.
   */
  async getActiveSprint(workspaceId: string): Promise<{
    id: string;
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    actionCount: number;
  } | null> {
    const sprint = await this.prisma.list.findFirst({
      where: {
        workspaceId,
        listType: "SPRINT",
        status: "ACTIVE",
      },
      include: {
        _count: { select: { actions: true } },
      },
    });

    if (!sprint) return null;

    return {
      id: sprint.id,
      name: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      actionCount: sprint._count.actions,
    };
  }

  /**
   * Get velocity history across recent completed sprints for trend analysis.
   *
   * Each cycle is **recomputed live** from its actions' current (final)
   * kanbanStatus — the same computation as {@link getSprintMetrics} — rather
   * than reading the dormant, never-written `SprintMetrics` rows (which made
   * this method return all-zeros in practice). A completed cycle's actions are
   * effectively immutable, so a live recompute is accurate and needs no stored
   * snapshot. No `SprintMetrics` row is written and no cron is introduced.
   * See ADR-0047.
   *
   * Returned most-recent-first (by `endDate` desc).
   */
  async getVelocityHistory(
    workspaceId: string,
    count = 5,
  ): Promise<VelocityHistoryPoint[]> {
    const completedSprints = await this.prisma.list.findMany({
      where: {
        workspaceId,
        listType: "SPRINT",
        status: "COMPLETED",
      },
      orderBy: { endDate: "desc" },
      take: count,
      select: { id: true },
    });

    const metrics = await Promise.all(
      completedSprints.map((sprint) => this.getSprintMetrics(sprint.id)),
    );

    return metrics.map((m) => ({
      sprintId: m.sprintId,
      sprintName: m.sprintName,
      endDate: m.endDate,
      completedActions: m.completedActions,
      completedEffort: m.completedEffort,
      velocity: m.velocity,
      completionRate: m.completionRate,
    }));
  }

  /**
   * Merged-PR turnaround for a cycle: average (and median) opened→merged time
   * for PRs merged within the cycle's [startDate, endDate] window.
   *
   * Computed **live** from the webhook-fed `GitHubActivity` event log — a PR's
   * `opened`-event `eventTimestamp` joined to its `prMergedAt`. Nothing is
   * persisted; `SprintMetrics.avgPrTurnaround` stays dormant per ADR-0047.
   * Merged-PR turnaround only (no open-PR-age panel).
   *
   * Returns zeros/nulls gracefully when the cycle has no window or no merged
   * PRs (no NaN from an empty average).
   */
  async getPrTurnaround(listId: string): Promise<PrTurnaroundResult> {
    const empty: PrTurnaroundResult = {
      mergedPrCount: 0,
      avgHours: null,
      medianHours: null,
    };

    const list = await this.prisma.list.findUniqueOrThrow({
      where: { id: listId },
      select: { startDate: true, endDate: true, workspaceId: true },
    });

    if (!list.startDate || !list.endDate || !list.workspaceId) return empty;

    const prs = await this.getMergedPrDurations(list.workspaceId, {
      start: list.startDate,
      end: list.endDate,
    });

    return summarizePrDurations(prs);
  }

  /**
   * Merged PRs for a workspace with their opened→merged duration, deduped by
   * (repo, PR number). Optionally restricted to a merge-time window.
   *
   * Shared by the single-cycle {@link getPrTurnaround} (window-scoped, two
   * queries) and the all-cycles roll-up (one unscoped pass, then bucketed per
   * cycle in memory rather than 2N queries).
   */
  private async getMergedPrDurations(
    workspaceId: string,
    window?: { start: Date; end: Date },
  ): Promise<MergedPrDuration[]> {
    const mergedRows = await this.prisma.gitHubActivity.findMany({
      where: {
        workspaceId,
        eventType: "pull_request",
        prNumber: { not: null },
        prMergedAt: window
          ? { gte: window.start, lte: window.end }
          : { not: null },
      },
      select: { prNumber: true, repoFullName: true, prMergedAt: true },
    });

    // Dedup to one merged timestamp per (repo, PR number).
    const mergedByPr = new Map<
      string,
      { prNumber: number; repoFullName: string; mergedAt: Date }
    >();
    for (const row of mergedRows) {
      if (row.prNumber == null || !row.prMergedAt) continue;
      const key = `${row.repoFullName}#${row.prNumber}`;
      const existing = mergedByPr.get(key);
      if (!existing || row.prMergedAt > existing.mergedAt) {
        mergedByPr.set(key, {
          prNumber: row.prNumber,
          repoFullName: row.repoFullName,
          mergedAt: row.prMergedAt,
        });
      }
    }

    if (mergedByPr.size === 0) return [];

    const merged = [...mergedByPr.values()];
    const prNumbers = [...new Set(merged.map((m) => m.prNumber))];
    const repoNames = [...new Set(merged.map((m) => m.repoFullName))];

    // Opened events for those PRs → earliest opened timestamp per PR.
    const openedRows = await this.prisma.gitHubActivity.findMany({
      where: {
        workspaceId,
        eventType: "pull_request",
        eventAction: "opened",
        prNumber: { in: prNumbers },
        repoFullName: { in: repoNames },
      },
      select: { prNumber: true, repoFullName: true, eventTimestamp: true },
    });

    const openedByPr = new Map<string, Date>();
    for (const row of openedRows) {
      if (row.prNumber == null) continue;
      const key = `${row.repoFullName}#${row.prNumber}`;
      const existing = openedByPr.get(key);
      if (!existing || row.eventTimestamp < existing) {
        openedByPr.set(key, row.eventTimestamp);
      }
    }

    return [...mergedByPr.entries()].map(([key, { mergedAt }]) => {
      const openedAt = openedByPr.get(key);
      // No opened event captured (or a clock-skewed negative) → not measurable,
      // but the PR still counts toward mergedPrCount.
      const ms = openedAt ? mergedAt.getTime() - openedAt.getTime() : null;
      return {
        key,
        mergedAt,
        hours: ms != null && ms >= 0 ? ms / (1000 * 60 * 60) : null,
      };
    });
  }

  /**
   * Every cycle's metrics for a workspace in one request, plus the summed
   * all-cycles roll-up that heads the Metrics page.
   *
   * Same Ticket-based definitions as {@link getCycleTicketMetrics} (ADR-0047),
   * but batched: one query for the cycles, one for all their tickets, and one
   * pass over the workspace's merged PRs — not 3N queries. Cycles holding no
   * tickets are dropped from the series so an auto-generated empty future cycle
   * doesn't flatten the chart.
   */
  async getAllCyclesMetrics(
    workspaceId: string,
  ): Promise<AllCyclesMetricsResult> {
    const empty: AllCyclesMetricsResult = {
      cycleCount: 0,
      totalTickets: 0,
      completedTickets: 0,
      completedPoints: 0,
      totalPoints: 0,
      completionRate: 0,
      mergedPrCount: 0,
      avgPrHours: null,
      medianPrHours: null,
      cycles: [],
    };

    const cycles = await this.prisma.list.findMany({
      where: { workspaceId, listType: "SPRINT" },
      // Chronological for the trend chart; undated cycles fall to the end.
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });

    if (cycles.length === 0) return empty;

    const tickets = await this.prisma.ticket.findMany({
      where: { cycleId: { in: cycles.map((c) => c.id) } },
      select: { cycleId: true, status: true, points: true },
    });

    const ticketsByCycle = new Map<
      string,
      { total: number; completed: number; completedPoints: number; totalPoints: number }
    >();
    for (const ticket of tickets) {
      if (!ticket.cycleId) continue;
      const bucket = ticketsByCycle.get(ticket.cycleId) ?? {
        total: 0,
        completed: 0,
        completedPoints: 0,
        totalPoints: 0,
      };
      const points = ticket.points ?? 0;
      bucket.total += 1;
      bucket.totalPoints += points;
      if (COMPLETED_TICKET_STATUSES.has(ticket.status)) {
        bucket.completed += 1;
        bucket.completedPoints += points;
      }
      ticketsByCycle.set(ticket.cycleId, bucket);
    }

    // Bound the PR scan to the union of every cycle window. A PR merged
    // outside all of them is discarded below anyway, so this is equivalent to
    // an unscoped fetch — but it keeps the query (and the `prNumber IN (…)`
    // list it builds) proportional to the cycles' span rather than to the
    // workspace's entire GitHubActivity history. No dated cycle → no window to
    // fall in, so skip the two queries entirely.
    const dated = cycles.filter((c) => c.startDate && c.endDate);
    const unionWindow = dated.length
      ? {
          start: new Date(
            Math.min(...dated.map((c) => c.startDate!.getTime())),
          ),
          end: new Date(Math.max(...dated.map((c) => c.endDate!.getTime()))),
        }
      : null;

    const allPrs = unionWindow
      ? await this.getMergedPrDurations(workspaceId, unionWindow)
      : [];

    const points: CycleMetricsPoint[] = [];
    // PRs counted in at least one cycle window, so overlapping windows don't
    // double-count them in the roll-up.
    const prsInAnyCycle = new Map<string, MergedPrDuration>();

    for (const cycle of cycles) {
      const bucket = ticketsByCycle.get(cycle.id);
      if (!bucket) continue; // empty cycle — nothing to plot

      const cyclePrs =
        cycle.startDate && cycle.endDate
          ? allPrs.filter(
              (pr) =>
                pr.mergedAt >= cycle.startDate! && pr.mergedAt <= cycle.endDate!,
            )
          : [];
      for (const pr of cyclePrs) prsInAnyCycle.set(pr.key, pr);
      const cyclePrSummary = summarizePrDurations(cyclePrs);

      points.push({
        cycleId: cycle.id,
        cycleName: cycle.name,
        status: cycle.status,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        totalTickets: bucket.total,
        completedTickets: bucket.completed,
        completedPoints: bucket.completedPoints,
        totalPoints: bucket.totalPoints,
        completionRate:
          bucket.total > 0 ? (bucket.completed / bucket.total) * 100 : 0,
        mergedPrCount: cyclePrSummary.mergedPrCount,
        avgPrHours: cyclePrSummary.avgHours,
      });
    }

    if (points.length === 0) return empty;

    const totals = points.reduce(
      (acc, p) => ({
        totalTickets: acc.totalTickets + p.totalTickets,
        completedTickets: acc.completedTickets + p.completedTickets,
        completedPoints: acc.completedPoints + p.completedPoints,
        totalPoints: acc.totalPoints + p.totalPoints,
      }),
      {
        totalTickets: 0,
        completedTickets: 0,
        completedPoints: 0,
        totalPoints: 0,
      },
    );

    const prSummary = summarizePrDurations([...prsInAnyCycle.values()]);

    return {
      cycleCount: points.length,
      ...totals,
      completionRate:
        totals.totalTickets > 0
          ? (totals.completedTickets / totals.totalTickets) * 100
          : 0,
      mergedPrCount: prSummary.mergedPrCount,
      avgPrHours: prSummary.avgHours,
      medianPrHours: prSummary.medianHours,
      cycles: points,
    };
  }

  /**
   * List a workspace's cycles (SPRINT lists) for the Metrics page selector.
   * Ordered most-recent-first by start date (undated cycles last, by recency).
   */
  async getWorkspaceCycles(workspaceId: string): Promise<CycleSummary[]> {
    const cycles = await this.prisma.list.findMany({
      where: { workspaceId, listType: "SPRINT" },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });

    return cycles.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
    }));
  }

  /**
   * Ticket-based cycle metrics for the Metrics page.
   *
   * Computes velocity and completion over the cycle's **Tickets**
   * (`Ticket.cycleId`), not its Actions — the product workflow assigns cycle
   * work as Tickets, so the Action-based {@link getSprintMetrics} returns zeros
   * for these cycles. Velocity is a completed-ticket count (headline) plus
   * summed points; "completed" = {@link COMPLETED_TICKET_STATUSES}. Computed
   * live; nothing persisted. See ADR-0047.
   */
  async getCycleTicketMetrics(
    listId: string,
  ): Promise<CycleTicketMetricsResult> {
    const list = await this.prisma.list.findUniqueOrThrow({
      where: { id: listId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });

    const tickets = await this.prisma.ticket.findMany({
      where: { cycleId: listId },
      select: { status: true, points: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const ticket of tickets) {
      statusCounts[ticket.status] = (statusCounts[ticket.status] ?? 0) + 1;
    }

    const completed = tickets.filter((t) =>
      COMPLETED_TICKET_STATUSES.has(t.status),
    );
    const completedTickets = completed.length;
    const totalTickets = tickets.length;
    const completedPoints = completed.reduce(
      (sum, t) => sum + (t.points ?? 0),
      0,
    );
    const totalPoints = tickets.reduce((sum, t) => sum + (t.points ?? 0), 0);
    const completionRate =
      totalTickets > 0 ? (completedTickets / totalTickets) * 100 : 0;

    return {
      cycleId: list.id,
      cycleName: list.name,
      startDate: list.startDate,
      endDate: list.endDate,
      totalTickets,
      completedTickets,
      completedPoints,
      totalPoints,
      completionRate,
      statusCounts,
    };
  }

  /**
   * Ticket-based velocity trend across recent completed cycles. Each cycle is
   * recomputed live via {@link getCycleTicketMetrics}. Returned most-recent-first.
   */
  async getTicketVelocityHistory(
    workspaceId: string,
    count = 5,
  ): Promise<CycleVelocityPoint[]> {
    const cycles = await this.prisma.list.findMany({
      where: {
        workspaceId,
        listType: "SPRINT",
        status: "COMPLETED",
      },
      orderBy: { endDate: "desc" },
      take: count,
      select: { id: true },
    });

    const metrics = await Promise.all(
      cycles.map((cycle) => this.getCycleTicketMetrics(cycle.id)),
    );

    return metrics.map((m) => ({
      cycleId: m.cycleId,
      cycleName: m.cycleName,
      endDate: m.endDate,
      completedTickets: m.completedTickets,
      completedPoints: m.completedPoints,
      completionRate: m.completionRate,
    }));
  }
}

// Export singleton instance
export const sprintAnalyticsService = new SprintAnalyticsService(db);
