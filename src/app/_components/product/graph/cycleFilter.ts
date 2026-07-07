import type {
  DependencyGraphBlockingEdge,
  DependencyGraphTicket,
} from "~/plugins/product/server/services/DependencyGraphService";

/**
 * Cycle filter for the dependency graph. CYCLE_FILTER_ALL shows the whole
 * graph; CYCLE_FILTER_NONE isolates unscheduled tickets; any other value is
 * a cycle (List) id.
 */
export type CycleFilterValue = string;

export const CYCLE_FILTER_ALL = "all";
export const CYCLE_FILTER_NONE = "none";

export interface CycleOption {
  id: string;
  name: string;
}

export interface CycleFilterResult {
  /** Tickets to draw, in the input order. */
  tickets: DependencyGraphTicket[];
  /**
   * Out-of-cycle direct blockers, rendered dimmed with a cycle chip.
   * Always a subset of `tickets`' ids; empty when the filter is "all".
   */
  dimmedTicketIds: Set<string>;
}

/** Distinct cycles present in the graph, sorted by name. */
export function deriveCycleOptions(
  tickets: DependencyGraphTicket[],
): CycleOption[] {
  const byId = new Map<string, string>();
  for (const t of tickets) {
    if (t.cycle) byId.set(t.cycle.id, t.cycle.name);
  }
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Whether any ticket has no cycle — gates the "No cycle" dropdown entry. */
export function hasUncycledTickets(tickets: DependencyGraphTicket[]): boolean {
  return tickets.some((t) => t.cycle === null);
}

/**
 * Restrict the graph to one cycle's tickets plus their direct (1-hop)
 * out-of-cycle blockers. Blockers-only by design: downstream dependents and
 * transitive chains stay hidden so the filtered view answers exactly
 * "what outside work is jamming this cycle?".
 */
export function applyCycleFilter(
  tickets: DependencyGraphTicket[],
  blockingEdges: DependencyGraphBlockingEdge[],
  filter: CycleFilterValue,
): CycleFilterResult {
  if (filter === CYCLE_FILTER_ALL) {
    return { tickets, dimmedTicketIds: new Set() };
  }

  const inCycle = new Set<string>();
  for (const t of tickets) {
    const matches =
      filter === CYCLE_FILTER_NONE ? t.cycle === null : t.cycle?.id === filter;
    if (matches) inCycle.add(t.id);
  }

  // Direction convention: fromTicketId blocks toTicketId.
  const dimmedTicketIds = new Set<string>();
  for (const e of blockingEdges) {
    if (inCycle.has(e.toTicketId) && !inCycle.has(e.fromTicketId)) {
      dimmedTicketIds.add(e.fromTicketId);
    }
  }

  return {
    tickets: tickets.filter(
      (t) => inCycle.has(t.id) || dimmedTicketIds.has(t.id),
    ),
    dimmedTicketIds,
  };
}
