import type { Prisma } from "@prisma/client";
import { parseTicketUrlId } from "~/lib/fun-ids";

/**
 * Where-clause for a ticket URL segment within one product: the sequential
 * number (`29`) or Linear-style id (`PLAT-29`), else a CUID or fun shortId.
 * Shared by `ticket.resolveId`, `ticket.getByRef` and the timer's
 * `timeEntry.resolveTarget`, so the accepted URL forms can't drift.
 */
export function ticketRefWhere(
  productId: string,
  identifier: string,
): Prisma.TicketWhereInput {
  const number = parseTicketUrlId(identifier);
  return number !== null
    ? { productId, number }
    : { productId, OR: [{ id: identifier }, { shortId: identifier }] };
}
