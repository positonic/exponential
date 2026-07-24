/**
 * Ticket type definitions — single source of truth for the `TicketType` enum
 * members as a value list. Sibling of `ticket-statuses.ts`.
 *
 * Lives in `lib` rather than beside the service that first needed it so client
 * components can build pickers and Zod enums from the same list without pulling
 * a server module (and its LLM dependencies) into the browser bundle.
 */

export const TICKET_TYPES = [
  "BUG",
  "FEATURE",
  "CHORE",
  "IMPROVEMENT",
  "SPIKE",
  "RESEARCH",
] as const;

export type TicketTypeValue = (typeof TICKET_TYPES)[number];
