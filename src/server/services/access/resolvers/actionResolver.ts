/**
 * Action Access Resolver
 *
 * Resolves action access through all possible paths:
 * - Direct ownership (createdById, when no assignees)
 * - Assignee
 * - Project access (creator, member, team member, workspace member, public)
 *
 * This centralizes the logic that was previously in buildUserActionPermissions()
 * and the inline checks scattered across the action router.
 */

import type { PrismaClient } from "@prisma/client";
import type { Permission } from "../types";
import { getProjectAccess, hasProjectAccess, canEditProject } from "./projectResolver";

interface ActionAccessInfo {
  isCreator: boolean;
  isAssignee: boolean;
  hasProjectAccess: boolean;
  canEditProject: boolean;
  isUnassigned: boolean;
}

export async function getActionAccess(
  db: PrismaClient,
  userId: string,
  actionId: string,
): Promise<ActionAccessInfo | null> {
  const action = await db.action.findUnique({
    where: { id: actionId },
    select: {
      createdById: true,
      projectId: true,
      assignees: { select: { userId: true } },
    },
  });

  if (!action) return null;

  const isCreator = action.createdById === userId;
  const isAssignee = action.assignees.some((a) => a.userId === userId);
  const isUnassigned = action.assignees.length === 0;

  // Check project-level access if action belongs to a project
  let projectAccess = null;
  if (action.projectId) {
    projectAccess = await getProjectAccess(db, userId, action.projectId);
  }

  return {
    isCreator,
    isAssignee,
    hasProjectAccess: projectAccess ? hasProjectAccess(projectAccess) : false,
    canEditProject: projectAccess ? canEditProject(projectAccess) : false,
    isUnassigned,
  };
}

/** Check if user can view this action */
export function canViewAction(access: ActionAccessInfo): boolean {
  // Creator can view their own unassigned actions
  if (access.isCreator && access.isUnassigned) return true;
  // Assignee can always view
  if (access.isAssignee) return true;
  // Project access grants view
  if (access.hasProjectAccess) return true;
  return false;
}

/** Check if user can edit this action */
export function canEditAction(access: ActionAccessInfo): boolean {
  // Creator can always edit
  if (access.isCreator) return true;
  // Assignee can edit
  if (access.isAssignee) return true;
  // Project editor (creator, team admin, workspace admin) can edit
  if (access.canEditProject) return true;
  return false;
}

/** Check permission for an action */
export function checkActionPermission(
  access: ActionAccessInfo,
  permission: Permission,
): boolean {
  switch (permission) {
    case "view":
      return canViewAction(access);
    case "edit":
    case "assign":
      return canEditAction(access);
    case "delete":
      // Only creator or project editors can delete
      return access.isCreator || access.canEditProject;
    case "admin":
      return access.isCreator || access.canEditProject;
    default:
      return false;
  }
}

/**
 * Build Prisma WHERE clause for actions a user can access.
 *
 * This replaces the old buildUserActionPermissions() function
 * and is used for bulk queries (getAll, getProjectActions, etc.)
 */
export function buildActionAccessWhere(userId: string) {
  return {
    OR: [
      // Created by user AND no assignees
      { createdById: userId, assignees: { none: {} } },
      // Assigned to user
      { assignees: { some: { userId } } },
      // User is the project creator
      { project: { createdById: userId } },
      // User is a direct project member
      { project: { projectMembers: { some: { userId } } } },
      // User is a member of the project's team
      { project: { team: { members: { some: { userId } } } } },
      // Action belongs to a public project
      { project: { isPublic: true } },
    ],
  };
}
