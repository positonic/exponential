import { COMPLETED_TICKET_STATUSES, type TicketStatus } from "~/lib/ticket-statuses";

const isCompleted = (t: { status: TicketStatus }) =>
  COMPLETED_TICKET_STATUSES.includes(t.status);

/**
 * Stable partition for a ticket's "Depends on" list: open tickets first,
 * completed ones after, each half in the original (link) order. An umbrella
 * ticket's breakdown is written in a deliberate order, so only done-ness
 * moves a row, not status rank.
 */
export function sortOpenFirst<T extends { status: TicketStatus }>(tickets: readonly T[]): T[] {
  return [...tickets.filter((t) => !isCompleted(t)), ...tickets.filter(isCompleted)];
}

/** "3/8 done" for a section header; null when there is nothing to count. */
export function dependencyProgress(
  tickets: ReadonlyArray<{ status: TicketStatus }>,
): string | null {
  if (tickets.length === 0) return null;
  return `${tickets.filter(isCompleted).length}/${tickets.length} done`;
}
