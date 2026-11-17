import type { api } from "~/trpc/react";

type TrpcUtils = ReturnType<typeof api.useUtils>;

/**
 * Refetch every cached ticket list after a ticket write: the list views'
 * `listSummaries` and the backlog's Completed count, which a status change
 * can move. Pass a product to limit it to that product's lists.
 */
export function invalidateTicketLists(
  utils: TrpcUtils,
  filter?: { productId: string },
) {
  return Promise.all([
    utils.product.ticket.listSummaries.invalidate(filter),
    utils.product.ticket.countCompleted.invalidate(filter),
  ]);
}
