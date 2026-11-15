/**
 * Free-text ticket search that puts the ticket a query *names* first.
 *
 * Every surface that searches tickets by typed text (the Cmd+K palette's
 * `search.global`, the product `ticket.search` picker the MCP and CLI use, the
 * database relation picker) goes through this, so a query of `snappy.thunder`,
 * `thunder snappy`, `42`, `#42` or `EXP-42` lands the ticket it identifies at
 * the top in all of them — rather than wherever an unordered `contains` scan
 * happened to put it, or past the result limit behind tickets that only share
 * a word.
 *
 * Access scoping stays with the caller: `find` receives only the *match*
 * clause and must AND it with that surface's own access where-clause. That
 * keeps each surface's scoping exactly where ACCESS_CONTROL.md expects it.
 */
import type { Prisma } from "@prisma/client";
import {
  isTicketIdMatch,
  parseTicketIdQuery,
  shortIdSearchWhere,
  ticketIdWhere,
} from "~/lib/fun-ids";

interface IdentifiableTicket {
  id: string;
  shortId: string | null;
  number: number;
}

export interface TicketTextSearchOptions<T extends IdentifiableTicket> {
  /** The typed query. Trimmed here; an empty query is the caller's business. */
  query: string;
  /** Maximum rows returned. */
  limit: number;
  /**
   * Run one `ticket.findMany` with `match` AND-ed into the caller's own access
   * scope, taking at most `take` rows after skipping `skip` (default 0), in a
   * stable order (most recently updated first).
   */
  find: (match: Prisma.TicketWhereInput, take: number, skip?: number) => Promise<T[]>;
  /**
   * The ticket's product name, needed only to honour a Linear-style prefix
   * (`EXP-42`). Without it, prefixed queries match no ticket exactly.
   */
  productName?: (ticket: T) => string | undefined;
}

/**
 * A cross-product search for `EXP-42` matches ticket 42 of every product the
 * caller can see, and only the product prefix tells them apart, which the
 * database can't filter on. So number matches are fetched a page at a time
 * and prefix-filtered, until enough exact matches are found or the candidates
 * run out, rather than one page cut off before the right product's ticket.
 */
const PREFIXED_ID_PAGE = 50;
/** Upper bound on pages for one prefixed query (1,000 candidates). */
const PREFIXED_ID_MAX_PAGES = 20;

export async function searchTicketsIdFirst<T extends IdentifiableTicket>({
  query,
  limit,
  find,
  productName,
}: TicketTextSearchOptions<T>): Promise<T[]> {
  const q = query.trim();
  const idQuery = parseTicketIdQuery(q);
  const idClauses = ticketIdWhere(idQuery);

  const textMatch: Prisma.TicketWhereInput = {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      // Fun shortIds also match partially and word-order-insensitively
      // ("toucan" or "toucan.prime" finds prime.toucan).
      ...shortIdSearchWhere(q),
    ],
  };

  const isExact = (t: T) => isTicketIdMatch(t, idQuery, productName?.(t));

  const findExact = async (): Promise<T[]> => {
    if (idClauses.length === 0) return [];
    const idMatch: Prisma.TicketWhereInput = { OR: idClauses };
    if (!idQuery.linearPrefix) return (await find(idMatch, limit)).filter(isExact);
    const found: T[] = [];
    for (let page = 0; page < PREFIXED_ID_MAX_PAGES && found.length < limit; page++) {
      const rows = await find(idMatch, PREFIXED_ID_PAGE, page * PREFIXED_ID_PAGE);
      found.push(...rows.filter(isExact));
      if (rows.length < PREFIXED_ID_PAGE) break;
    }
    return found;
  };

  const [exact, textRows] = await Promise.all([findExact(), find(textMatch, limit)]);
  const seen = new Set(exact.map((t) => t.id));
  return [...exact, ...textRows.filter((t) => !seen.has(t.id))].slice(0, limit);
}
