import { type PrismaClient, type ActionStatus } from "@prisma/client";
import { isOpenBlocker } from "~/lib/actions/blocked";
import { db } from "~/server/db";
import { resolveGithubLogins } from "~/server/services/github/memberLogins";

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
  /**
   * Untracked work (Daily worklog V4): CONFIRMED time entries in the cycle's
   * workspace and window whose Action has no Ticket — shipped work nobody
   * filed. Computed on request, never stored (ADR-0047). Zero when the cycle
   * has no dates.
   */
  untrackedWorkEntries: number;
  untrackedWorkMinutes: number;
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

/**
 * Narrows the Metrics page to some workspace members. A Ticket counts toward
 * the member it's **assigned** to; a PR/commit toward the member whose GitHub
 * login authored it (see `resolveGithubLogins`); a time entry toward the
 * member who logged it. Absent or empty `memberIds` means the whole workspace.
 */
export interface MetricsMemberFilter {
  memberIds?: string[];
}

/** One person's contribution over the chosen cycle(s). */
export interface ContributorRow {
  /** Null for the "Unassigned" row (tickets with no assignee). */
  userId: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
  /** False for an assignee/time-logger who is no longer a workspace member. */
  isMember: boolean;
  /** Whether a GitHub login is known — without one, PRs/commits read as 0. */
  githubLinked: boolean;
  assignedTickets: number;
  completedTickets: number;
  completedPoints: number;
  totalPoints: number;
  /** PRs merged inside the cycle window(s), deduped by repo + PR number. */
  mergedPrs: number;
  /** Commits pushed inside the cycle window(s), deduped by SHA. */
  commits: number;
  /** CONFIRMED time logged inside the cycle window(s), in minutes. */
  minutesLogged: number;
}

export interface ContributionsResult {
  /** Sorted by completed tickets, then points, then name; Unassigned last. */
  rows: ContributorRow[];
}

/** A merged PR with its opened→merged duration, when measurable. */
interface MergedPrDuration {
  /** `${repoFullName}#${prNumber}` — the dedup key. */
  key: string;
  mergedAt: Date;
  /** Lowercased GitHub login of the PR author, when recorded. */
  author: string | null;
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

/** The filter's member ids, or null when the filter is off (absent/empty). */
function filterMemberIds(filter?: MetricsMemberFilter): string[] | null {
  return filter?.memberIds?.length ? filter.memberIds : null;
}

interface TimeWindow {
  start: Date;
  end: Date;
}

/** The dated cycles' windows. Undated cycles have no window to fall in. */
function cycleWindows(
  cycles: { startDate: Date | null; endDate: Date | null }[],
): TimeWindow[] {
  return cycles.flatMap((c) =>
    c.startDate && c.endDate ? [{ start: c.startDate, end: c.endDate }] : [],
  );
}

/** The single span covering every window, or null when there are none. */
function unionOf(windows: TimeWindow[]): TimeWindow | null {
  if (windows.length === 0) return null;
  return {
    start: new Date(Math.min(...windows.map((w) => w.start.getTime()))),
    end: new Date(Math.max(...windows.map((w) => w.end.getTime()))),
  };
}

/**
 * Whether `at` falls in any window. PR merges use an inclusive end (as
 * `getPrTurnaround`); time entries an exclusive one (as untracked work).
 */
function inAnyWindow(
  at: Date,
  windows: TimeWindow[],
  opts?: { endExclusive?: boolean },
): boolean {
  return windows.some(
    (w) => at >= w.start && (opts?.endExclusive ? at < w.end : at <= w.end),
  );
}

export class SprintAnalyticsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Lowercased GitHub logins of the filtered members, or null when the filter
   * is off. A filtered member with no linked GitHub contributes no login, so
   * their PRs are (honestly) not counted rather than guessed.
   */
  private async filterLogins(
    workspaceId: string,
    filter?: MetricsMemberFilter,
  ): Promise<Set<string> | null> {
    const memberIds = filterMemberIds(filter);
    if (!memberIds) return null;
    const logins = await resolveGithubLogins(this.prisma, memberIds);
    return new Set([...logins.values()].map((l) => l.toLowerCase()));
  }

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
                depsOut: { select: { dependsOn: { select: { status: true } } } },
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
        return a.kanbanStatus !== "DONE" && a.kanbanStatus !== "CANCELLED" && a.depsOut.some(isOpenBlocker);
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
  async getPrTurnaround(
    listId: string,
    filter?: MetricsMemberFilter,
  ): Promise<PrTurnaroundResult> {
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

    const [prs, logins] = await Promise.all([
      this.getMergedPrDurations(list.workspaceId, {
        start: list.startDate,
        end: list.endDate,
      }),
      this.filterLogins(list.workspaceId, filter),
    ]);

    return summarizePrDurations(
      logins ? prs.filter((pr) => pr.author && logins.has(pr.author)) : prs,
    );
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
      select: {
        prNumber: true,
        repoFullName: true,
        prMergedAt: true,
        prAuthor: true,
      },
    });

    // Dedup to one merged timestamp per (repo, PR number).
    const mergedByPr = new Map<
      string,
      {
        prNumber: number;
        repoFullName: string;
        mergedAt: Date;
        author: string | null;
      }
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
          author: row.prAuthor?.toLowerCase() ?? null,
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

    return [...mergedByPr.entries()].map(([key, { mergedAt, author }]) => {
      const openedAt = openedByPr.get(key);
      // No opened event captured (or a clock-skewed negative) → not measurable,
      // but the PR still counts toward mergedPrCount.
      const ms = openedAt ? mergedAt.getTime() - openedAt.getTime() : null;
      return {
        key,
        mergedAt,
        author,
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
   *
   * With a member `filter`, every number narrows to those members (see
   * {@link MetricsMemberFilter}) but the series keeps the same cycles.
   */
  async getAllCyclesMetrics(
    workspaceId: string,
    filter?: MetricsMemberFilter,
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

    const fetched = await this.prisma.list.findMany({
      where: { workspaceId, listType: "SPRINT" },
      // Chronological for the trend chart; undated cycles fall to the end.
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
      },
    });

    // Undated cycles (e.g. auto-created by the Notion import, which sets no
    // dates) have no chronology, and createdAt is import order — which can be
    // newest-first. Order them by the number in their name ("Cycle 7"), and
    // slot the ones numbered below the earliest dated cycle BEFORE the dated
    // run — imported history ("Cycle 1".."Cycle 7" before a dated "Cycle 8")
    // then reads oldest → newest even before backfill-cycle-dates.ts has run.
    // Unnumbered ones keep createdAt order at the very end.
    const cycleNumber = (name: string): number | null => {
      const match = /(\d+)\s*$/.exec(name.trim());
      return match?.[1] ? Number(match[1]) : null;
    };
    const datedCycles = fetched.filter((c) => c.startDate);
    const undatedCycles = fetched
      .filter((c) => !c.startDate)
      .sort((a, b) => {
        const an = cycleNumber(a.name);
        const bn = cycleNumber(b.name);
        if (an != null && bn != null) return an - bn;
        if (an != null) return -1;
        if (bn != null) return 1;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    const datedNumbers = datedCycles
      .map((c) => cycleNumber(c.name))
      .filter((n): n is number => n != null);
    const earliestDatedNumber = datedNumbers.length
      ? Math.min(...datedNumbers)
      : null;
    const preDated = (c: (typeof fetched)[number]) => {
      const n = cycleNumber(c.name);
      return (
        earliestDatedNumber != null && n != null && n < earliestDatedNumber
      );
    };
    const cycles = [
      ...undatedCycles.filter(preDated),
      ...datedCycles,
      ...undatedCycles.filter((c) => !preDated(c)),
    ];

    if (cycles.length === 0) return empty;

    // Fetched unfiltered: whether a cycle has tickets AT ALL decides if it's
    // on the chart, so filtering to a member keeps the same x-axis (with zeros
    // where they had nothing) instead of silently dropping cycles.
    const tickets = await this.prisma.ticket.findMany({
      where: { cycleId: { in: cycles.map((c) => c.id) } },
      select: { cycleId: true, status: true, points: true, assigneeId: true },
    });
    const memberIds = filterMemberIds(filter);
    const memberSet = memberIds ? new Set(memberIds) : null;

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
      ticketsByCycle.set(ticket.cycleId, bucket);
      if (memberSet && !(ticket.assigneeId && memberSet.has(ticket.assigneeId))) {
        continue;
      }
      const points = ticket.points ?? 0;
      bucket.total += 1;
      bucket.totalPoints += points;
      if (COMPLETED_TICKET_STATUSES.has(ticket.status)) {
        bucket.completed += 1;
        bucket.completedPoints += points;
      }
    }

    // Bound the PR scan to the union of every cycle window. A PR merged
    // outside all of them is discarded below anyway, so this is equivalent to
    // an unscoped fetch — but it keeps the query (and the `prNumber IN (…)`
    // list it builds) proportional to the cycles' span rather than to the
    // workspace's entire GitHubActivity history. No dated cycle → no window to
    // fall in, so skip the two queries entirely.
    const unionWindow = unionOf(cycleWindows(cycles));

    const [mergedPrs, logins] = await Promise.all([
      unionWindow
        ? this.getMergedPrDurations(workspaceId, unionWindow)
        : Promise.resolve([]),
      this.filterLogins(workspaceId, filter),
    ]);
    const allPrs = logins
      ? mergedPrs.filter((pr) => pr.author && logins.has(pr.author))
      : mergedPrs;

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
   * Per-person contributions for the Metrics page: one row per workspace
   * member (plus anyone else with activity in scope, and an "Unassigned" row
   * for tickets nobody owns).
   *
   * Scope is one cycle (`cycleId`) or, when omitted, every cycle holding a
   * ticket — the same set the all-cycles roll-up sums. Tickets attribute by
   * assignee; PRs merged and commits pushed by GitHub login (members without a
   * linked login get 0 and `githubLinked: false`); time by who logged it.
   * PRs/commits/time count only inside the cycle window(s). Computed live,
   * batched, nothing persisted (ADR-0047). Returns every row — the page
   * filters to selected members client-side so one fetch serves any filter.
   */
  async getContributions(
    workspaceId: string,
    cycleId?: string,
  ): Promise<ContributionsResult> {
    const cyclesInWorkspace = await this.prisma.list.findMany({
      where: {
        workspaceId,
        listType: "SPRINT",
        ...(cycleId ? { id: cycleId } : {}),
      },
      select: { id: true, startDate: true, endDate: true },
    });

    const [tickets, directMembers, teamMembers] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { cycleId: { in: cyclesInWorkspace.map((c) => c.id) } },
        select: { cycleId: true, status: true, points: true, assigneeId: true },
      }),
      this.prisma.workspaceUser.findMany({
        where: { workspaceId },
        select: { userId: true },
      }),
      this.prisma.teamUser.findMany({
        where: { team: { workspaceId } },
        select: { userId: true },
      }),
    ]);

    // All-cycles scope mirrors the roll-up: only cycles holding tickets. A
    // single picked cycle keeps its window even when it has no tickets.
    const cyclesWithTickets = new Set(tickets.map((t) => t.cycleId));
    const scopedCycles = cycleId
      ? cyclesInWorkspace
      : cyclesInWorkspace.filter((c) => cyclesWithTickets.has(c.id));
    const scopedCycleIds = new Set(scopedCycles.map((c) => c.id));
    const windows = cycleWindows(scopedCycles);
    const span = unionOf(windows);

    const memberIds = new Set([
      ...directMembers.map((m) => m.userId),
      ...teamMembers.map((m) => m.userId),
    ]);
    const assigneeIds = tickets
      .map((t) => t.assigneeId)
      .filter((id): id is string => id != null);

    const [logins, prs, pushes, timeEntries] = await Promise.all([
      resolveGithubLogins(this.prisma, [
        ...new Set([...memberIds, ...assigneeIds]),
      ]),
      span ? this.getMergedPrDurations(workspaceId, span) : Promise.resolve([]),
      span
        ? this.prisma.gitHubActivity.findMany({
            where: {
              workspaceId,
              eventType: "push",
              commitAuthor: { not: null },
              eventTimestamp: { gte: span.start, lte: span.end },
            },
            // externalId is the full commit SHA; commitSha is only 7 chars.
            select: { externalId: true, commitAuthor: true, eventTimestamp: true },
          })
        : Promise.resolve([]),
      span
        ? this.prisma.timeEntry.findMany({
            where: {
              workspaceId,
              status: "CONFIRMED",
              // Exclusive end, matching the cycle's untracked-work metric.
              startedAt: { gte: span.start, lt: span.end },
              endedAt: { not: null },
            },
            select: { userId: true, startedAt: true, endedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const userByLogin = new Map(
      [...logins.entries()].map(([userId, login]) => [login.toLowerCase(), userId]),
    );

    type Tally = Omit<
      ContributorRow,
      "name" | "email" | "image" | "isMember" | "githubLinked"
    >;
    const UNASSIGNED = "";
    const rows = new Map<string, Tally>();
    const rowFor = (userId: string | null) => {
      const key = userId ?? UNASSIGNED;
      let row = rows.get(key);
      if (!row) {
        row = {
          userId,
          assignedTickets: 0,
          completedTickets: 0,
          completedPoints: 0,
          totalPoints: 0,
          mergedPrs: 0,
          commits: 0,
          minutesLogged: 0,
        };
        rows.set(key, row);
      }
      return row;
    };
    for (const id of memberIds) rowFor(id);

    for (const ticket of tickets) {
      if (!ticket.cycleId || !scopedCycleIds.has(ticket.cycleId)) continue;
      const row = rowFor(ticket.assigneeId);
      const points = ticket.points ?? 0;
      row.assignedTickets += 1;
      row.totalPoints += points;
      if (COMPLETED_TICKET_STATUSES.has(ticket.status)) {
        row.completedTickets += 1;
        row.completedPoints += points;
      }
    }

    for (const pr of prs) {
      if (!pr.author || !inAnyWindow(pr.mergedAt, windows)) continue;
      const userId = userByLogin.get(pr.author);
      if (userId) rowFor(userId).mergedPrs += 1;
    }

    const seenCommits = new Set<string>();
    for (const push of pushes) {
      if (!push.commitAuthor || !inAnyWindow(push.eventTimestamp, windows)) continue;
      if (seenCommits.has(push.externalId)) continue;
      seenCommits.add(push.externalId);
      const userId = userByLogin.get(push.commitAuthor.toLowerCase());
      if (userId) rowFor(userId).commits += 1;
    }

    for (const entry of timeEntries) {
      if (!entry.endedAt || !inAnyWindow(entry.startedAt, windows, { endExclusive: true })) {
        continue;
      }
      rowFor(entry.userId).minutesLogged += Math.max(
        0,
        Math.round((entry.endedAt.getTime() - entry.startedAt.getTime()) / 60_000),
      );
    }

    const userIds = [...rows.keys()].filter((key) => key !== UNASSIGNED);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, image: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const result: ContributorRow[] = [...rows.values()].map((row) => {
      const user = row.userId ? userById.get(row.userId) : undefined;
      return {
        ...row,
        name: user?.name ?? null,
        email: user?.email ?? null,
        image: user?.image ?? null,
        isMember: row.userId != null && memberIds.has(row.userId),
        githubLinked: row.userId != null && logins.has(row.userId),
      };
    });

    const label = (r: ContributorRow) => r.name ?? r.email ?? "";
    result.sort((a, b) => {
      if (a.userId == null) return 1;
      if (b.userId == null) return -1;
      return (
        b.completedTickets - a.completedTickets ||
        b.completedPoints - a.completedPoints ||
        label(a).localeCompare(label(b))
      );
    });

    // An "Unassigned" row with nothing in it is noise.
    return {
      rows: result.filter((r) => r.userId != null || r.assignedTickets > 0),
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
    filter?: MetricsMemberFilter,
  ): Promise<CycleTicketMetricsResult> {
    const list = await this.prisma.list.findUniqueOrThrow({
      where: { id: listId },
      select: { id: true, name: true, startDate: true, endDate: true, workspaceId: true },
    });

    const memberIds = filterMemberIds(filter);

    const tickets = await this.prisma.ticket.findMany({
      where: {
        cycleId: listId,
        ...(memberIds ? { assigneeId: { in: memberIds } } : {}),
      },
      select: { status: true, points: true },
    });

    // Untracked work: confirmed time in the cycle window on Actions with no
    // Ticket. Only a dated cycle has a window; an undated one reports zero.
    let untrackedWorkEntries = 0;
    let untrackedWorkMinutes = 0;
    if (list.startDate && list.endDate) {
      const untracked = await this.prisma.timeEntry.findMany({
        where: {
          workspaceId: list.workspaceId,
          status: "CONFIRMED",
          startedAt: { gte: list.startDate, lt: list.endDate },
          endedAt: { not: null },
          action: { ticketId: null },
          ...(memberIds ? { userId: { in: memberIds } } : {}),
        },
        select: { startedAt: true, endedAt: true },
      });
      untrackedWorkEntries = untracked.length;
      untrackedWorkMinutes = untracked.reduce(
        (sum, e) => sum + Math.max(0, Math.round((e.endedAt!.getTime() - e.startedAt.getTime()) / 60_000)),
        0,
      );
    }

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
      untrackedWorkEntries,
      untrackedWorkMinutes,
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
