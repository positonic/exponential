/**
 * Ticket status definitions - single source of truth for labels, colors, and ordering.
 */

export type TicketStatus =
  | "BACKLOG"
  | "NEEDS_REFINEMENT"
  | "READY_TO_PLAN"
  | "COMMITTED"
  | "IN_PROGRESS"
  | "QA"
  | "DONE"
  | "DEPLOYED"
  | "ARCHIVED";

export const TICKET_STATUSES: Array<{ value: TicketStatus; label: string; color: string; order: number }> = [
  { value: "BACKLOG", label: "Backlog", color: "gray", order: 0 },
  { value: "NEEDS_REFINEMENT", label: "Needs refinement", color: "violet", order: 1 },
  { value: "READY_TO_PLAN", label: "Ready to plan", color: "indigo", order: 2 },
  { value: "COMMITTED", label: "Committed", color: "blue", order: 3 },
  { value: "IN_PROGRESS", label: "In progress", color: "yellow", order: 4 },
  { value: "QA", label: "QA", color: "orange", order: 5 },
  { value: "DONE", label: "Done", color: "green", order: 6 },
  { value: "DEPLOYED", label: "Deployed", color: "teal", order: 7 },
  { value: "ARCHIVED", label: "Archived", color: "dark", order: 8 },
];

export const STATUS_MAP = Object.fromEntries(
  TICKET_STATUSES.map((s) => [s.value, s]),
) as Record<TicketStatus, (typeof TICKET_STATUSES)[number]>;

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  TICKET_STATUSES.map((s) => [s.value, s.label]),
);

export const STATUS_COLORS: Record<string, string> = Object.fromEntries(
  TICKET_STATUSES.map((s) => [s.value, s.color]),
);

export const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  TICKET_STATUSES.map((s) => [s.value, s.order]),
);

/** Statuses considered "done" - separated into completed section */
export const COMPLETED_STATUSES = new Set<string>(["DONE", "DEPLOYED", "ARCHIVED"]);

/** Select options for dropdowns */
export const STATUS_OPTIONS = TICKET_STATUSES.map((s) => ({
  value: s.value,
  label: s.label,
}));

/** Board columns - only active workflow stages, not archived */
export const BOARD_COLUMNS = TICKET_STATUSES.filter((s) => s.value !== "ARCHIVED");
