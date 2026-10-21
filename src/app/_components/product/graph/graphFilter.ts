import type {
  DependencyGraphBlockingEdge,
  DependencyGraphTicket,
} from "~/plugins/product/server/services/DependencyGraphService";

export interface GraphFilterResult {
  /** Tickets to draw, in the input order. */
  tickets: DependencyGraphTicket[];
  /**
   * Out-of-filter direct blockers, rendered dimmed with a cycle chip.
   * Always a subset of `tickets`' ids; empty when nothing is filtered.
   */
  dimmedTicketIds: Set<string>;
}

/**
 * Restrict the graph to the tickets matching `isMatch` plus their direct
 * (1-hop) non-matching blockers. The Backlog's facet filters (status,
 * priority, type, DRI, epic, cycle, labels) drive the predicate.
 *
 * Blockers-only by design: downstream dependents and transitive chains stay
 * hidden so the filtered view answers exactly "what outside work is jamming
 * these tickets?". Pass `null` for no filter: everything passes undimmed.
 */
export function applyGraphFilter(
  tickets: DependencyGraphTicket[],
  blockingEdges: DependencyGraphBlockingEdge[],
  isMatch: ((ticket: DependencyGraphTicket) => boolean) | null,
): GraphFilterResult {
  if (isMatch === null) {
    return { tickets, dimmedTicketIds: new Set() };
  }

  const allTicketIds = new Set(tickets.map((t) => t.id));
  const matched = new Set<string>();
  for (const t of tickets) {
    if (isMatch(t)) matched.add(t.id);
  }

  // Direction convention: fromTicketId blocks toTicketId. Skip blockers with
  // no ticket in the input (e.g. an edge whose blocker was excluded upstream)
  // so the returned set stays a strict subset of the input tickets' ids.
  const dimmedTicketIds = new Set<string>();
  for (const e of blockingEdges) {
    if (
      matched.has(e.toTicketId) &&
      !matched.has(e.fromTicketId) &&
      allTicketIds.has(e.fromTicketId)
    ) {
      dimmedTicketIds.add(e.fromTicketId);
    }
  }

  return {
    tickets: tickets.filter(
      (t) => matched.has(t.id) || dimmedTicketIds.has(t.id),
    ),
    dimmedTicketIds,
  };
}
