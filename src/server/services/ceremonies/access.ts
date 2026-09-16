/**
 * Ceremony-level authority (ADR-0059), on top of workspace membership: the
 * ceremony owner, or a workspace owner/admin, may generate, circulate and
 * post its agendas. Resolved through the central access service's
 * membership resolver and role hierarchy — never an inline role list.
 */
import type { PrismaClient } from "@prisma/client";
import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import { hasMinimumWorkspaceRole } from "~/server/services/access/types";

export async function canManageCeremony(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  ceremonyOwnerId: string,
): Promise<boolean> {
  if (ceremonyOwnerId === userId) return true;
  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  return membership ? hasMinimumWorkspaceRole(membership.role, "admin") : false;
}
