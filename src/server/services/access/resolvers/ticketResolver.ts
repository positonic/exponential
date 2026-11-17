/**
 * Ticket access. A Ticket has no members of its own: it is reached through
 * its Product's Workspace. Reading needs workspace membership (direct or via
 * a team; project-only guests are denied), the same rule `ticket.list` and
 * global search apply. Writing needs a workspace write role (owner, admin or
 * member), so a read-only viewer cannot hang new rows off a Ticket.
 */
import type { Prisma } from "@prisma/client";
import {
  buildWorkspaceAccessWhere,
  buildWorkspaceWriteWhere,
} from "./workspaceResolver";

/** Tickets the user can read. */
export function buildTicketAccessWhere(userId: string): Prisma.TicketWhereInput {
  return { product: { workspace: { is: buildWorkspaceAccessWhere(userId) } } };
}

/** Tickets the user can attach work to (an Action, time). Viewers excluded. */
export function buildTicketWriteWhere(userId: string): Prisma.TicketWhereInput {
  return { product: { workspace: { is: buildWorkspaceWriteWhere(userId) } } };
}
