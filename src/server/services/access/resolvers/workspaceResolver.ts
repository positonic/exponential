/**
 * Workspace Access Resolver
 *
 * Resolves workspace membership and role for a given user.
 * Single source of truth for "does this user belong to this workspace?"
 *
 * Access is granted via two paths:
 * 1. Direct membership: user has a WorkspaceUser record
 * 2. Team membership: user is in a team linked to the workspace (Team.workspaceId)
 */

import type { PrismaClient } from "@prisma/client";
import type { WorkspaceMembership, WorkspaceRole } from "../types";

export async function getWorkspaceMembership(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership | null> {
  // 1. Check direct workspace membership
  const membership = await db.workspaceUser.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { role: true, workspaceId: true },
  });

  if (membership) {
    return {
      role: membership.role as WorkspaceRole,
      workspaceId: membership.workspaceId,
    };
  }

  // 2. Fallback: check team-based workspace access
  //    User is a member of a team that is linked to this workspace
  const teamMembership = await db.teamUser.findFirst({
    where: {
      userId,
      team: { workspaceId },
    },
    select: {
      role: true,
      team: { select: { workspaceId: true } },
    },
  });

  if (teamMembership?.team.workspaceId) {
    return {
      role: "member" as WorkspaceRole,
      workspaceId: teamMembership.team.workspaceId,
    };
  }

  return null;
}

/**
 * Build a Prisma WHERE clause that matches workspaces the user can access,
 * either via direct WorkspaceUser membership or via team membership.
 */
export function buildWorkspaceAccessWhere(userId: string) {
  return {
    OR: [
      // Direct workspace membership
      { members: { some: { userId } } },
      // Team-based workspace access: user is in a team linked to this workspace
      { teams: { some: { members: { some: { userId } } } } },
    ],
  };
}

/** Check if user is the workspace owner (via ownerId field on Workspace) */
export async function isWorkspaceOwner(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  return workspace?.ownerId === userId;
}
