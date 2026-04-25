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

const KANBAN_STATUSES: ActionStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
];

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

    // Map ActionList entries to include both the action data and the list-join createdAt
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
   * Get velocity history across past sprints for trend analysis.
   */
  async getVelocityHistory(
    workspaceId: string,
    count = 5,
  ): Promise<Array<{ sprintName: string; velocity: number; completionRate: number }>> {
    const completedSprints = await this.prisma.list.findMany({
      where: {
        workspaceId,
        listType: "SPRINT",
        status: "COMPLETED",
      },
      orderBy: { endDate: "desc" },
      take: count,
      include: {
        metrics: true,
      },
    });

    return completedSprints.map((sprint) => ({
      sprintName: sprint.name,
      velocity: sprint.metrics?.velocity ?? 0,
      completionRate: sprint.metrics?.completionRate ?? 0,
    }));
  }
}

// Export singleton instance
export const sprintAnalyticsService = new SprintAnalyticsService(db);
