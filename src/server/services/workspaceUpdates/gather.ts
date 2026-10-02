import type { PrismaClient, TicketType } from "@prisma/client";

import { parseCommitMessage, type CommitCategory } from "~/lib/changelog/commitCategories";
import { ticketUrlId } from "~/lib/fun-ids";

import type { ShippedItem } from "./types";

/**
 * Newsworthiness by source. Feature-level shipping outranks the ticket that
 * delivered it; chores, spikes and research never make an update.
 */
export const SOURCE_WEIGHT = {
  feature: 100,
  feature_scope: 80,
  cycle: 60,
  goal_update: 15,
  pull_request: 10,
} as const;

export const TICKET_TYPE_WEIGHT: Record<TicketType, number> = {
  FEATURE: 40,
  IMPROVEMENT: 30,
  BUG: 20,
  CHORE: 0,
  SPIKE: 0,
  RESEARCH: 0,
};

/** Conventional-commit types that never describe a user-facing change. */
const INTERNAL_PR_CATEGORIES = new Set<CommitCategory>(["chore", "ci", "build", "test", "style", "refactor"]);

export interface GatherInput {
  workspaceId: string;
  workspaceSlug: string;
  windowStart: Date;
  windowEnd: Date;
  /** Absolute app origin, so links work from email and Matrix too. */
  baseUrl: string;
}

/**
 * Everything user-facing that shipped in `[windowStart, windowEnd)` for one
 * workspace, normalised to {@link ShippedItem}s. Deterministic: the model
 * never sees anything this did not return.
 */
export async function gatherShippedWork(
  db: PrismaClient,
  input: GatherInput,
): Promise<ShippedItem[]> {
  const window = { gte: input.windowStart, lt: input.windowEnd };
  const productBase = (productSlug: string) =>
    `${input.baseUrl}/w/${input.workspaceSlug}/products/${productSlug}`;

  const [scopes, tickets, featureEvents, cycles, goalUpdates] = await Promise.all([
    db.featureScope.findMany({
      where: {
        status: "SHIPPED",
        shippedAt: window,
        feature: { product: { workspaceId: input.workspaceId } },
      },
      select: {
        id: true,
        version: true,
        description: true,
        shippedAt: true,
        feature: {
          select: { id: true, name: true, product: { select: { slug: true } } },
        },
      },
    }),
    db.ticket.findMany({
      where: {
        status: { in: ["DONE", "DEPLOYED"] },
        completedAt: window,
        product: { workspaceId: input.workspaceId },
      },
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        completedAt: true,
        product: { select: { slug: true } },
      },
    }),
    // Feature has no shippedAt; going Live is recorded as a status change.
    db.workspaceActivityEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        entityType: "feature",
        action: "status_changed",
        createdAt: window,
        metadata: { path: ["to"], equals: "SHIPPED" },
      },
      select: { entityId: true, createdAt: true },
    }),
    db.list.findMany({
      where: {
        workspaceId: input.workspaceId,
        listType: "SPRINT",
        endDate: window,
        achievements: { not: null },
      },
      select: {
        id: true,
        name: true,
        achievements: true,
        endDate: true,
        product: { select: { slug: true } },
      },
    }),
    // Only good news ships: at-risk / off-track notes are internal health.
    db.goalUpdate.findMany({
      where: {
        createdAt: window,
        health: "on-track",
        goal: { workspaceId: input.workspaceId },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        goal: { select: { id: true, title: true } },
      },
    }),
  ]);

  const items: ShippedItem[] = [];

  for (const scope of scopes) {
    items.push({
      id: `feature_scope:${scope.id}`,
      source: "feature_scope",
      title: `${scope.feature.name} ${scope.version}`,
      detail: scope.description || undefined,
      url: `${productBase(scope.feature.product.slug)}/features/${scope.feature.id}`,
      weight: SOURCE_WEIGHT.feature_scope,
      at: (scope.shippedAt ?? input.windowEnd).toISOString(),
    });
  }

  for (const ticket of tickets) {
    items.push({
      id: `ticket:${ticket.id}`,
      source: "ticket",
      title: ticket.title,
      url: `${productBase(ticket.product.slug)}/tickets/${ticketUrlId(ticket)}`,
      weight: TICKET_TYPE_WEIGHT[ticket.type],
      at: (ticket.completedAt ?? input.windowEnd).toISOString(),
    });
  }

  const featureIds = [...new Set(featureEvents.map((e) => e.entityId))];
  const features = featureIds.length
    ? await db.feature.findMany({
        where: { id: { in: featureIds }, status: "SHIPPED", product: { workspaceId: input.workspaceId } },
        select: { id: true, name: true, description: true, product: { select: { slug: true } } },
      })
    : [];
  const liveAt = new Map(featureEvents.map((e) => [e.entityId, e.createdAt]));
  for (const feature of features) {
    items.push({
      id: `feature:${feature.id}`,
      source: "feature",
      title: feature.name,
      detail: feature.description ?? undefined,
      url: `${productBase(feature.product.slug)}/features/${feature.id}`,
      weight: SOURCE_WEIGHT.feature,
      at: (liveAt.get(feature.id) ?? input.windowEnd).toISOString(),
    });
  }

  for (const cycle of cycles) {
    if (!cycle.achievements?.trim()) continue;
    items.push({
      id: `cycle:${cycle.id}`,
      source: "cycle",
      title: `${cycle.name} wrapped up`,
      detail: cycle.achievements.trim(),
      url: cycle.product ? `${productBase(cycle.product.slug)}/cycles/${cycle.id}` : undefined,
      weight: SOURCE_WEIGHT.cycle,
      at: (cycle.endDate ?? input.windowEnd).toISOString(),
    });
  }

  for (const update of goalUpdates) {
    items.push({
      id: `goal_update:${update.id}`,
      source: "goal_update",
      title: `Progress on ${update.goal.title}`,
      detail: update.content,
      url: `${input.baseUrl}/w/${input.workspaceSlug}/goals/${update.goal.id}`,
      weight: SOURCE_WEIGHT.goal_update,
      at: update.createdAt.toISOString(),
    });
  }

  // Merged PRs are a last resort: they describe how, not what. Only used when
  // the workspace tracks nothing richer for the window.
  if (!items.some((item) => item.weight > 0)) {
    const prs = await db.gitHubActivity.findMany({
      where: {
        workspaceId: input.workspaceId,
        eventType: "pull_request",
        prMergedAt: window,
      },
      select: { prNumber: true, prTitle: true, prUrl: true, prMergedAt: true, repoFullName: true },
      orderBy: { prMergedAt: "desc" },
    });
    const seen = new Set<string>();
    for (const pr of prs) {
      const key = `${pr.repoFullName}#${pr.prNumber}`;
      if (!pr.prTitle || seen.has(key)) continue;
      seen.add(key);
      // Non-conventional titles stay ("update"); only known-internal types go.
      const { category, text } = parseCommitMessage(pr.prTitle);
      if (INTERNAL_PR_CATEGORIES.has(category)) continue;
      items.push({
        id: `pull_request:${key}`,
        source: "pull_request",
        title: text,
        url: pr.prUrl ?? undefined,
        weight: SOURCE_WEIGHT.pull_request,
        at: (pr.prMergedAt ?? input.windowEnd).toISOString(),
      });
    }
  }

  return items;
}
