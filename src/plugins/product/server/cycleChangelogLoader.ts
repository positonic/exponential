import type { PrismaClient } from "@prisma/client";
import {
  assignPullRequestsToCycles,
  buildCycleChangelog,
  type ChangelogPullRequest,
  type ChangelogTicket,
  type CycleChangelog,
} from "./cycleChangelog";

/**
 * Loads the data behind the workspace change-log page: one product's dated
 * cycles, newest first, each turned into a {@link CycleChangelog}.
 *
 * Access is NOT enforced here — the caller resolves workspace membership first.
 */

export const CHANGELOG_DEFAULT_CYCLES = 4;
export const CHANGELOG_MAX_CYCLES = 24;
/** Safety cap on PR rows; 24 two-week cycles of a busy workspace fit easily. */
const MAX_PULL_REQUESTS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChangelogCycle {
  id: string;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
  cycleGoal: string | null;
  changelog: CycleChangelog;
}

export interface WorkspaceChangelog {
  products: { id: string; name: string; slug: string }[];
  product: { id: string; name: string; slug: string } | null;
  cycles: ChangelogCycle[];
  hasMore: boolean;
}

export async function loadWorkspaceChangelog(
  db: PrismaClient,
  args: { workspaceId: string; productId?: string; limit?: number },
): Promise<WorkspaceChangelog> {
  const limit = Math.min(
    args.limit ?? CHANGELOG_DEFAULT_CYCLES,
    CHANGELOG_MAX_CYCLES,
  );

  const products = await db.product.findMany({
    where: { workspaceId: args.workspaceId },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
  const product =
    products.find((p) => p.id === args.productId) ?? products[0] ?? null;
  if (!product) return { products, product: null, cycles: [], hasMore: false };

  // Only cycles that have started and carry dates can have shipped anything.
  // Archived cycles are hidden everywhere else, so they are hidden here too.
  const rows = await db.list.findMany({
    where: {
      workspaceId: args.workspaceId,
      listType: "SPRINT",
      status: { in: ["ACTIVE", "COMPLETED"] },
      startDate: { not: null },
      endDate: { not: null },
      OR: [{ productId: product.id }, { productId: null }],
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      cycleGoal: true,
    },
  });
  const hasMore = rows.length > limit;
  const cycles = rows.slice(0, limit).map((c) => ({
    ...c,
    startDate: c.startDate!,
    endDate: c.endDate!,
  }));
  if (cycles.length === 0) return { products, product, cycles: [], hasMore };

  const from = new Date(Math.min(...cycles.map((c) => c.startDate.getTime())));
  const to = new Date(
    Math.max(...cycles.map((c) => c.endDate.getTime())) + DAY_MS,
  );

  const [tickets, prRows] = await Promise.all([
    db.ticket.findMany({
      where: { cycleId: { in: cycles.map((c) => c.id) }, productId: product.id },
      select: {
        id: true,
        number: true,
        shortId: true,
        title: true,
        type: true,
        status: true,
        points: true,
        prUrl: true,
        branchName: true,
        cycleId: true,
        feature: { select: { id: true, name: true } },
      },
    }),
    db.gitHubActivity.findMany({
      where: {
        workspaceId: args.workspaceId,
        eventType: "pull_request",
        prState: "merged",
        eventTimestamp: { gte: from, lt: to },
      },
      orderBy: { eventTimestamp: "asc" },
      take: MAX_PULL_REQUESTS,
      select: {
        eventTimestamp: true,
        repoFullName: true,
        branchName: true,
        prNumber: true,
        prTitle: true,
        prUrl: true,
        prAuthor: true,
        prMergedAt: true,
      },
    }),
  ]);

  const pullRequests: ChangelogPullRequest[] = prRows.map((row) => ({
    repoFullName: row.repoFullName,
    prNumber: row.prNumber,
    title: row.prTitle ?? `PR #${row.prNumber ?? "?"}`,
    url: row.prUrl,
    branchName: row.branchName,
    author: row.prAuthor,
    mergedAt: row.prMergedAt ?? row.eventTimestamp,
  }));
  const prsByCycle = assignPullRequestsToCycles(cycles, pullRequests);

  const ticketsByCycle = new Map<string, ChangelogTicket[]>();
  for (const t of tickets) {
    if (!t.cycleId) continue;
    const list = ticketsByCycle.get(t.cycleId) ?? [];
    list.push({
      id: t.id,
      number: t.number,
      shortId: t.shortId,
      title: t.title,
      type: t.type,
      status: t.status,
      points: t.points,
      featureId: t.feature?.id ?? null,
      featureName: t.feature?.name ?? null,
      prUrl: t.prUrl,
      branchName: t.branchName,
    });
    ticketsByCycle.set(t.cycleId, list);
  }

  return {
    products,
    product,
    hasMore,
    cycles: cycles.map((cycle) => ({
      ...cycle,
      changelog: buildCycleChangelog({
        tickets: ticketsByCycle.get(cycle.id) ?? [],
        pullRequests: prsByCycle.get(cycle.id) ?? [],
      }),
    })),
  };
}
