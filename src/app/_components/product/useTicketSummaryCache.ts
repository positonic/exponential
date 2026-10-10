"use client";

import { useQueryClient, type Query, type QueryKey } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api, type RouterOutputs } from "~/trpc/react";
import { IN_FLIGHT_TICKET_STATUSES } from "~/lib/ticket-statuses";

export type TicketSummary = RouterOutputs["product"]["ticket"]["listSummaries"][number];

type SummariesSnapshot = Array<[QueryKey, TicketSummary[] | undefined]>;

const holds = (rows: unknown, ticketId: string) =>
  Array.isArray(rows) && (rows as TicketSummary[]).some((r) => r.id === ticketId);

/** Server-derived: an open blocker only counts as "blocked" while in flight. */
export function withBlockedFlag(row: TicketSummary): TicketSummary {
  return {
    ...row,
    isBlocked: row.openBlockerCount > 0 && IN_FLIGHT_TICKET_STATUSES.includes(row.status),
  };
}

/**
 * Optimistic access to every cached `listSummaries` list - the Backlog table
 * and board, a Feature's ticket list - so an edit made in the peek drawer or
 * on the detail page shows on the row behind it at once, not after a full
 * list refetch. Lists are cached per filter input, so a ticket can sit in
 * several; each holding it is patched.
 */
export function useTicketSummaryCache() {
  const queryClient = useQueryClient();
  const allLists = getQueryKey(api.product.ticket.listSummaries);

  const forTickets = (ticketIds: string[]) => ({
    queryKey: allLists,
    predicate: (q: Query) => ticketIds.some((id) => holds(q.state.data, id)),
  });

  /** Cancel in-flight list fetches that would overwrite the patch, then snapshot. */
  const snapshot = async (...ticketIds: string[]): Promise<SummariesSnapshot> => {
    await queryClient.cancelQueries(forTickets(ticketIds));
    return queryClient.getQueriesData<TicketSummary[]>(forTickets(ticketIds));
  };

  const restore = (snap: SummariesSnapshot | undefined) => {
    for (const [key, data] of snap ?? []) queryClient.setQueryData(key, data);
  };

  const patch = (ticketId: string, update: (row: TicketSummary) => TicketSummary) => {
    queryClient.setQueriesData<TicketSummary[]>(forTickets([ticketId]), (rows) =>
      rows?.map((r) => (r.id === ticketId ? update(r) : r)),
    );
  };

  /**
   * Reconcile after a property edit. An unfiltered list holding the ticket
   * already shows the patched row, so it is only marked stale (refetched on
   * the next focus or mount) - on a large product that refetch is the
   * heaviest request on the page. A filtered list (status, assignee,
   * feature...) refetches now: the edit may move the ticket in or out of it.
   * `force` refetches every list - for when the patch couldn't build the row
   * faithfully (a relation id not in the loaded option lists yet).
   */
  const reconcile = async (productId: string, ticketId: string, force = false) => {
    const productLists = getQueryKey(api.product.ticket.listSummaries, { productId }, "query");
    await queryClient.invalidateQueries({ queryKey: productLists, refetchType: "none" });
    await queryClient.refetchQueries({
      queryKey: productLists,
      type: "active",
      predicate: (q) => {
        const input = (q.queryKey[1] as { input?: Record<string, unknown> } | undefined)?.input ?? {};
        const filtered = Object.entries(input).some(([k, v]) => k !== "productId" && v !== undefined);
        return force || filtered || !holds(q.state.data, ticketId);
      },
    });
  };

  return { snapshot, restore, patch, reconcile };
}
