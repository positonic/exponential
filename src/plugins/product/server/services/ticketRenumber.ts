/**
 * Ticket renumber allocator (ADR-0027) — a pure module that assigns
 * collision-free `number`/`shortId` values from a destination Product's
 * sequence to a set of moving tickets.
 *
 * Tickets are hard-scoped to one Product with per-product numbering
 * (`@@unique([productId, number])`, `@@unique([productId, shortId])`), so a
 * moved ticket cannot carry its source number across — it must be re-issued a
 * fresh number from the destination. Numbers are allocated *above* everything
 * already in the destination (both its monotonic `ticketCounter` and any
 * number actually present), so the result is always disjoint from the used set
 * and from the other moving tickets — no unique-constraint violation is
 * possible.
 *
 * Pure: the only non-determinism is the optional `generateShortId` (defaults to
 * the random {@link generateFunId}); number allocation is fully deterministic.
 */

import { generateFunId } from "~/lib/fun-ids";
import type { TicketRenumber } from "./featureMove";

export interface AllocateTicketNumbersInput {
  /** Ids of the moving tickets, in the order numbers should be assigned. */
  ticketIds: string[];
  /** Destination Product's current monotonic `ticketCounter`. */
  ticketCounter: number;
  /** Numbers already present in the destination Product. */
  usedNumbers: number[];
  /** Whether the destination Product issues fun shortIds. */
  funTicketIds: boolean;
  /** ShortIds already present in the destination Product. */
  usedShortIds: string[];
  /**
   * ShortId generator, injectable for deterministic tests. Receives the set of
   * shortIds already taken (destination + previously allocated this batch) and
   * must return one not in it. Defaults to {@link generateFunId}.
   */
  generateShortId?: (taken: Set<string>) => string;
}

export interface AllocateTicketNumbersResult {
  assignments: TicketRenumber[];
  /** The destination Product's `ticketCounter` after this allocation. */
  nextTicketCounter: number;
}

/**
 * Allocate fresh, collision-free `number`/`shortId` values for the moving
 * tickets from the destination Product's sequence.
 */
export function allocateTicketNumbers(
  input: AllocateTicketNumbersInput,
): AllocateTicketNumbersResult {
  const gen = input.generateShortId ?? generateFunId;

  // Start above both the monotonic counter and any number actually present, so
  // assignments can never collide with the destination or each other.
  const base = Math.max(input.ticketCounter, 0, ...input.usedNumbers);

  const takenShortIds = new Set(input.usedShortIds);
  const assignments: TicketRenumber[] = input.ticketIds.map((ticketId, i) => {
    let shortId: string | null = null;
    if (input.funTicketIds) {
      shortId = gen(takenShortIds);
      takenShortIds.add(shortId);
    }
    return { ticketId, number: base + i + 1, shortId };
  });

  return {
    assignments,
    nextTicketCounter: base + input.ticketIds.length,
  };
}
