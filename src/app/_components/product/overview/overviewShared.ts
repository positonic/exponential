import type { RouterOutputs } from "~/trpc/react";
import { generateLinearId } from "~/lib/fun-ids";
import type { TicketStatus } from "~/lib/ticket-statuses";

export type ProductOverviewData =
  RouterOutputs["product"]["product"]["getOverview"];

export interface OverviewProduct {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  funTicketIds: boolean;
}

/**
 * Status → CSS color for this surface, per the design handoff's semantic
 * mapping (accent tokens, not Mantine palette names — see the PR notes for
 * the deliberate divergence from STATUS_COLORS).
 */
export const OVERVIEW_STATUS_CSS: Record<TicketStatus, string> = {
  BACKLOG: "var(--color-text-faint)",
  NEEDS_REFINEMENT: "var(--accent-okr)",
  READY_TO_PLAN: "var(--accent-quick)",
  COMMITTED: "var(--accent-ritual)",
  IN_PROGRESS: "var(--brand-400)",
  BLOCKED: "var(--accent-due)",
  QA: "var(--accent-meetings)",
  DONE: "var(--accent-crm)",
  DEPLOYED: "var(--accent-crm)",
  ARCHIVED: "var(--color-text-faint)",
};

export function statusCss(status: string): string {
  return (
    OVERVIEW_STATUS_CSS[status as TicketStatus] ?? "var(--color-text-faint)"
  );
}

/** Open statuses shown by the backlog pulse, in workflow order. */
export const OPEN_PULSE_STATUSES: TicketStatus[] = [
  "BACKLOG",
  "NEEDS_REFINEMENT",
  "READY_TO_PLAN",
  "COMMITTED",
  "IN_PROGRESS",
  "BLOCKED",
  "QA",
];

/** "CLR-241"-style display id, honouring the product's fun-id setting. */
export function ticketDisplayId(
  product: { name: string; funTicketIds: boolean },
  ticket: { shortId: string | null; number: number },
): string {
  if (product.funTicketIds && ticket.shortId) return ticket.shortId;
  return ticket.number > 0
    ? generateLinearId(product.name, ticket.number)
    : "—";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative age ("4h", "2d") for ticket rows and activity times. */
export function compactAge(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  // Clamp future timestamps (client/server clock skew) to "now".
  if (ms < MINUTE) return "now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  const days = Math.floor(ms / DAY);
  return days > 30 ? `${Math.floor(days / 7)}w` : `${days}d`;
}

/** A ticket sitting untouched this long in an attention state is "stale". */
export function isStale(updatedAt: Date | string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > 3 * DAY;
}
