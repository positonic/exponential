/**
 * Workspace Access Resolver
 *
 * Resolves workspace membership and role for a given user.
 * Single source of truth for "does this user belong to this workspace?"
 */

import type { PrismaClient } from "@prisma/client";
import type { WorkspaceMembership, WorkspaceRole } from "../types";

export async function getWorkspaceMembership(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership | null> {
  const membership = await db.workspaceUser.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { role: true, workspaceId: true },
  });

  if (!membership) return null;

  return {
    role: membership.role as WorkspaceRole,
    workspaceId: membership.workspaceId,
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
