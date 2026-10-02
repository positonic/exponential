import type { PrismaClient, TicketType } from "@prisma/client";

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

  const [scopes, tickets] = await Promise.all([
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

  return items;
}
