import type { PrismaClient } from "@prisma/client";
import {
  assignPullRequestsToCycles,
  buildCycleChangelog,
  CHANGELOG_MAX_CYCLES,
  type ChangelogCycleWindow,
  type ChangelogPullRequest,
  type ChangelogTicket,
  type CycleChangelog,
} from "./cycleChangelog";
import {
  parseDraftContent,
  type CycleChangelogDraftContent,
} from "./cycleChangelogDraft";

/**
 * Loads the data behind the workspace change-log page: one product's dated
 * cycles, newest first, each turned into a {@link CycleChangelog}, plus the
 * cycle's written draft when one exists.
 *
 * Access is NOT enforced here — the caller resolves workspace membership first.
 */

export const CHANGELOG_DEFAULT_CYCLES = 4;
export { CHANGELOG_MAX_CYCLES };
/** Safety cap on PR rows; 24 two-week cycles of a busy workspace fit easily. */
const MAX_PULL_REQUESTS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChangelogCycleDraft {
  version: string | null;
  content: CycleChangelogDraftContent;
  source: string;
  generatedAt: Date;
  updatedAt: Date;
}

export interface ChangelogCycle {
  id: string;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
  cycleGoal: string | null;
  changelog: CycleChangelog;
  draft: ChangelogCycleDraft | null;
}

export interface WorkspaceChangelog {
  products: { id: string; name: string; slug: string }[];
  product: { id: string; name: string; slug: string } | null;
  cycles: ChangelogCycle[];
  hasMore: boolean;
}

export interface CycleInputs {
  tickets: ChangelogTicket[];
  pullRequests: ChangelogPullRequest[];
}

/**
 * The tickets and merged PRs behind each cycle's change log. `productId`
 * scopes tickets to one product (null for a legacy workspace-shared cycle);
 * `withBodies` also loads ticket descriptions, which only the LLM draft reads.
 */
export async function loadChangelogInputs(
  db: PrismaClient,
  args: {
    workspaceId: string;
    productId: string | null;
    cycles: ChangelogCycleWindow[];
    withBodies?: boolean;
  },
): Promise<Map<string, CycleInputs>> {
  const result = new Map<string, CycleInputs>(
    args.cycles.map((c) => [c.id, { tickets: [], pullRequests: [] }]),
  );
  if (args.cycles.length === 0) return result;

  // Rows are fetched by `eventTimestamp` but assigned to cycles by merge time
  // (`prMergedAt`), which can differ slightly; a day of slack either side keeps
  // a PR merged on a boundary from falling out of the fetch.
  const from = new Date(
    Math.min(...args.cycles.map((c) => c.startDate.getTime())) - DAY_MS,
  );
  const to = new Date(
    Math.max(...args.cycles.map((c) => c.endDate.getTime())) + 2 * DAY_MS,
  );

  const [tickets, prRows] = await Promise.all([
    db.ticket.findMany({
      where: {
        cycleId: { in: args.cycles.map((c) => c.id) },
        ...(args.productId ? { productId: args.productId } : {}),
      },
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
        body: args.withBodies ?? false,
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
  for (const [cycleId, prs] of assignPullRequestsToCycles(
    args.cycles,
    pullRequests,
  )) {
    result.get(cycleId)!.pullRequests = prs;
  }

  for (const t of tickets) {
    if (!t.cycleId) continue;
    result.get(t.cycleId)?.tickets.push({
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
      ...("body" in t ? { body: t.body } : {}),
    });
  }
  return result;
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
      changelogDraft: {
        select: {
          version: true,
          content: true,
          source: true,
          generatedAt: true,
          updatedAt: true,
        },
      },
    },
  });
  const hasMore = rows.length > limit;
  const cycles = rows.slice(0, limit).map((c) => ({
    ...c,
    startDate: c.startDate!,
    endDate: c.endDate!,
  }));

  const inputs = await loadChangelogInputs(db, {
    workspaceId: args.workspaceId,
    productId: product.id,
    cycles,
  });

  return {
    products,
    product,
    hasMore,
    cycles: cycles.map(({ changelogDraft, ...cycle }) => {
      const content = changelogDraft
        ? parseDraftContent(changelogDraft.content)
        : null;
      return {
        ...cycle,
        changelog: buildCycleChangelog(
          inputs.get(cycle.id) ?? { tickets: [], pullRequests: [] },
        ),
        // A stored draft that no longer parses falls back to the raw view
        // rather than breaking the page.
        draft:
          changelogDraft && content
            ? {
                version: changelogDraft.version,
                content,
                source: changelogDraft.source,
                generatedAt: changelogDraft.generatedAt,
                updatedAt: changelogDraft.updatedAt,
              }
            : null,
      };
    }),
  };
}
