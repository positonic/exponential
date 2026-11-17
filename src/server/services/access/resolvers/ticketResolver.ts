/**
 * Ticket access (and the other Product-plugin entities: Feature, Cycle).
 * None has members of its own: each is reached through its Workspace. Reading needs workspace membership (direct or via
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

/** Features the user can read: workspace membership via the product. */
export function buildFeatureAccessWhere(userId: string): Prisma.FeatureWhereInput {
  return { product: { workspace: { is: buildWorkspaceAccessWhere(userId) } } };
}

/** Cycles (`List` rows with `listType: SPRINT`) the user can read. */
export function buildCycleAccessWhere(userId: string): Prisma.ListWhereInput {
  return { listType: "SPRINT", workspace: { is: buildWorkspaceAccessWhere(userId) } };
}

/** Tickets the user can attach work to (an Action, time). Viewers excluded. */
export function buildTicketWriteWhere(userId: string): Prisma.TicketWhereInput {
  return { product: { workspace: { is: buildWorkspaceWriteWhere(userId) } } };
}
