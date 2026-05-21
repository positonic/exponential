import type { PrismaClient, $Enums } from "@prisma/client";
import {
  COMPLETED_TICKET_STATUSES,
  IN_FLIGHT_TICKET_STATUSES,
  type TicketStatus,
} from "~/lib/ticket-statuses";

export interface DependencyGraphTicket {
  id: string;
  number: number;
  shortId: string | null;
  title: string;
  status: TicketStatus;
  priority: number | null;
  featureId: string | null;
  assignee: { id: string; name: string | null; image: string | null } | null;
  openBlockerCount: number;
  isBlocked: boolean;
}

export interface DependencyGraphFeature {
  id: string;
  name: string;
  status: $Enums.FeatureStatus;
  goalId: number | null;
}

export interface DependencyGraphObjective {
  id: number;
  title: string;
  period: string | null;
}

export interface DependencyGraphBlockingEdge {
  fromTicketId: string;
  toTicketId: string;
}

export interface DependencyGraph {
  objectives: DependencyGraphObjective[];
  features: DependencyGraphFeature[];
  tickets: DependencyGraphTicket[];
  blockingEdges: DependencyGraphBlockingEdge[];
  foreignTickets: DependencyGraphTicket[];
}

export interface BuildGraphOptions {
  productId: string;
  includeCompleted?: boolean;
  includeForeign?: boolean;
}

/**
 * Build a dependency-graph projection for one Product.
 *
 * Slice 1 returns only objectives, features, tickets, and intra-Product
 * blocking edges. `foreignTickets` is always empty here — Slice 2 (ADR-0002)
 * will populate it via a 1-hop fan-out across same-Workspace Products.
 */
export async function buildGraph(
  prisma: PrismaClient,
  options: BuildGraphOptions,
): Promise<DependencyGraph> {
  const { productId, includeCompleted = false } = options;

  const rawTickets = await prisma.ticket.findMany({
    where: {
      productId,
      ...(includeCompleted
        ? {}
        : { status: { notIn: COMPLETED_TICKET_STATUSES as TicketStatus[] } }),
    },
    orderBy: [{ status: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      shortId: true,
      title: true,
      status: true,
      priority: true,
      featureId: true,
      assignee: { select: { id: true, name: true, image: true } },
      depsOut: { select: { dependsOn: { select: { status: true } } } },
    },
  });

  const tickets: DependencyGraphTicket[] = rawTickets.map((t) => {
    const openBlockerCount = t.depsOut.filter(
      (d) => !COMPLETED_TICKET_STATUSES.includes(d.dependsOn.status),
    ).length;
    const isBlocked =
      openBlockerCount > 0 && IN_FLIGHT_TICKET_STATUSES.includes(t.status);
    return {
      id: t.id,
      number: t.number,
      shortId: t.shortId,
      title: t.title,
      status: t.status,
      priority: t.priority,
      featureId: t.featureId,
      assignee: t.assignee,
      openBlockerCount,
      isBlocked,
    };
  });

  const visibleTicketIds = new Set(tickets.map((t) => t.id));

  // Blocking edges: only those where BOTH endpoints are visible.
  // Direction convention: blocker → blocked, i.e. from = dependsOnId, to = ticketId.
  const rawDeps = visibleTicketIds.size
    ? await prisma.ticketDependency.findMany({
        where: {
          ticketId: { in: Array.from(visibleTicketIds) },
          dependsOnId: { in: Array.from(visibleTicketIds) },
        },
        orderBy: [{ dependsOnId: "asc" }, { ticketId: "asc" }],
        select: { ticketId: true, dependsOnId: true },
      })
    : [];

  const blockingEdges: DependencyGraphBlockingEdge[] = rawDeps.map((d) => ({
    fromTicketId: d.dependsOnId,
    toTicketId: d.ticketId,
  }));

  // Features: only those with at least one visible Ticket.
  const visibleFeatureIds = new Set<string>();
  for (const t of tickets) {
    if (t.featureId) visibleFeatureIds.add(t.featureId);
  }

  const features: DependencyGraphFeature[] = visibleFeatureIds.size
    ? (
        await prisma.feature.findMany({
          where: { id: { in: Array.from(visibleFeatureIds) } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, status: true, goalId: true },
        })
      ).map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status,
        goalId: f.goalId,
      }))
    : [];

  // Objectives: distinct goalIds reachable from visible Features.
  const visibleGoalIds = new Set<number>();
  for (const f of features) {
    if (f.goalId !== null) visibleGoalIds.add(f.goalId);
  }

  const objectives: DependencyGraphObjective[] = visibleGoalIds.size
    ? (
        await prisma.goal.findMany({
          where: { id: { in: Array.from(visibleGoalIds) } },
          orderBy: { title: "asc" },
          select: { id: true, title: true, period: true },
        })
      ).map((g) => ({ id: g.id, title: g.title, period: g.period }))
    : [];

  return {
    objectives,
    features,
    tickets,
    blockingEdges,
    foreignTickets: [],
  };
}
