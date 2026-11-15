/**
 * The admin view of the usage ledger for one calendar month: what each
 * workspace's Assistant use cost on the hosted key, and where that spend sits
 * in the distribution. It exists to size the assistant allowance (so that
 * 80-90% of workspaces stay under it) and to reconcile the ledger's total
 * against the provider's own invoice.
 *
 * Read-only, and never shown to workspaces: they only ever see a share.
 */
import type { PrismaClient } from "@prisma/client";

import { usagePeriodEnd, usagePeriodStart, USAGE_SOURCES, type UsageSource } from "./usage";

/** How many workspaces the table lists, highest spend first. The summary covers all of them. */
export const SPEND_REPORT_ROW_LIMIT = 200;

export interface WorkspaceSpend {
  workspaceId: string;
  /** Null when the workspace has since been deleted: the ledger outlives it. */
  name: string | null;
  slug: string | null;
  type: string | null;
  /** Hosted-key spend this month, USD × 1e6. */
  costMicros: number;
  /** Metered turns this month, own-key turns included. */
  events: number;
}

export interface SpendReport {
  periodStart: Date;
  periodEnd: Date;
  /** Hosted-key spend this month across every workspace, USD × 1e6. */
  totalMicros: number;
  /** Workspaces with any hosted-key spend this month: the population the percentiles describe. */
  workspacesWithSpend: number;
  /** Per-workspace monthly spend that this share of those workspaces stay at or under. Null with no spend. */
  percentiles: { p50: number | null; p80: number | null; p90: number | null };
  /** The month's hosted-key spend and turns by where they came from. */
  bySource: Array<{ source: UsageSource; costMicros: number; events: number }>;
  /** Turns that ran on a workspace's own key this month: recorded, never counted. */
  ownKey: { costMicros: number; events: number };
  workspaces: WorkspaceSpend[];
}

/**
 * Nearest-rank percentile: the smallest value that at least `percent`% of the
 * values are at or under. So "p80 = $2.10" reads directly as "an allowance of
 * $2.10 would have covered 80% of these workspaces". Null for an empty list.
 */
export function nearestRankPercentile(values: readonly number[], percent: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percent / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? null;
}

export async function getSpendReport(
  db: Pick<PrismaClient, "workspaceUsagePeriod" | "usageEvent" | "workspace">,
  /** Any instant in the month to report on. */
  month: Date,
): Promise<SpendReport> {
  const periodStart = usagePeriodStart(month);
  const periodEnd = usagePeriodEnd(month);
  const inMonth = { createdAt: { gte: periodStart, lt: periodEnd } };

  const [periods, sourceGroups, workspaceEventGroups] = await Promise.all([
    db.workspaceUsagePeriod.findMany({
      where: { periodStart, costMicros: { gt: 0 } },
      orderBy: { costMicros: "desc" },
      select: { workspaceId: true, costMicros: true },
    }),
    db.usageEvent.groupBy({
      by: ["source", "onOwnKey"],
      where: inMonth,
      _sum: { costMicros: true },
      _count: { _all: true },
    }),
    db.usageEvent.groupBy({
      by: ["workspaceId"],
      where: inMonth,
      _count: { _all: true },
    }),
  ]);

  const listed = periods.slice(0, SPEND_REPORT_ROW_LIMIT);
  const workspaceRows = await db.workspace.findMany({
    where: { id: { in: listed.map((period) => period.workspaceId) } },
    select: { id: true, name: true, slug: true, type: true },
  });
  const workspaceById = new Map(workspaceRows.map((workspace) => [workspace.id, workspace]));
  const eventsByWorkspace = new Map(workspaceEventGroups.map((group) => [group.workspaceId, group._count._all]));

  const spends = periods.map((period) => Number(period.costMicros));
  const hosted = sourceGroups.filter((group) => !group.onOwnKey);
  const ownKey = sourceGroups.filter((group) => group.onOwnKey);

  return {
    periodStart,
    periodEnd,
    totalMicros: spends.reduce((sum, costMicros) => sum + costMicros, 0),
    workspacesWithSpend: periods.length,
    percentiles: {
      p50: nearestRankPercentile(spends, 50),
      p80: nearestRankPercentile(spends, 80),
      p90: nearestRankPercentile(spends, 90),
    },
    bySource: USAGE_SOURCES.map((source) => {
      const group = hosted.find((candidate) => candidate.source === source);
      return { source, costMicros: group?._sum.costMicros ?? 0, events: group?._count._all ?? 0 };
    }),
    ownKey: {
      costMicros: ownKey.reduce((sum, group) => sum + (group._sum.costMicros ?? 0), 0),
      events: ownKey.reduce((sum, group) => sum + group._count._all, 0),
    },
    workspaces: listed.map((period) => {
      const workspace = workspaceById.get(period.workspaceId);
      return {
        workspaceId: period.workspaceId,
        name: workspace?.name ?? null,
        slug: workspace?.slug ?? null,
        type: workspace?.type ?? null,
        costMicros: Number(period.costMicros),
        events: eventsByWorkspace.get(period.workspaceId) ?? 0,
      };
    }),
  };
}
