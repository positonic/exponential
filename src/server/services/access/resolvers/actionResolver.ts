/**
 * Action Access Resolver
 *
 * Resolves action access through all possible paths:
 * - Direct ownership (createdById, when no assignees)
 * - Owning the agent that created it, inside a workspace the owner still
 *   belongs to (ADR-0049 delegation invariant)
 * - Assignee
 * - Project access (creator, member, team member, workspace member, public)
 *
 * This centralizes the logic that was previously in buildUserActionPermissions()
 * and the inline checks scattered across the action router.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { Permission } from "../types";
import {
  getProjectAccess,
  hasProjectAccess,
  canEditProject,
  isProjectInsider,
  buildProjectEditWhere,
} from "./projectResolver";
import {
  buildWorkspaceAccessWhere,
  buildWorkspaceWriteWhere,
  canEditWorkspaceContent,
  getWorkspaceMembership,
} from "./workspaceResolver";

interface ActionAccessInfo {
  isCreator: boolean;
  /**
   * The action was created by an agent this user owns (an External agent or
   * an Assistant, writing as its shadow user; ADR-0049, ADR-0067), and the
   * user still belongs to the action's workspace. Grants view: without it a
   * project-less action an agent created was readable by the agent alone.
   *
   * Scoped to the workspace on purpose. An agent leaves a workspace when its
   * owner does, and this path leaves with them: it never reaches rows in a
   * workspace the owner has been removed from. An action in no workspace has
   * nothing to leave, so owning the agent is enough there.
   */
  hasAgentOwnerAccess: boolean;
  /**
   * As `hasAgentOwnerAccess`, and the user holds a write role in the action's
   * workspace (or it has none). Grants edit and delete: a workspace `viewer`
   * reads what their agent created but does not write through this path.
   */
  canEditAsAgentOwner: boolean;
  isAssignee: boolean;
  hasProjectAccess: boolean;
  canEditProject: boolean;
  /**
   * Project access via a membership path, NOT mere `isPublic` visibility.
   * Use this — never `hasProjectAccess` — to gate anything that exposes the
   * workspace around the action (member rosters, org-wide data).
   */
  isProjectInsider: boolean;
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
      workspaceId: true,
      assignees: { select: { userId: true } },
      createdBy: { select: { externalAgentShadow: { select: { ownerId: true } } } },
      project: { select: { workspaceId: true } },
    },
  });

  if (!action) return null;

  const isCreator = action.createdById === userId;
  const isAssignee = action.assignees.some((a) => a.userId === userId);

  // The agent-owner path: decided by the owner's *current* standing in the
  // action's workspace (its own, else its project's), never by ownership of
  // the agent alone.
  let hasAgentOwnerAccess = false;
  let canEditAsAgentOwner = false;
  if (action.createdBy?.externalAgentShadow?.ownerId === userId) {
    const workspaceId = action.workspaceId ?? action.project?.workspaceId ?? null;
    if (workspaceId === null) {
      hasAgentOwnerAccess = true;
      canEditAsAgentOwner = true;
    } else {
      const membership = await getWorkspaceMembership(db, userId, workspaceId);
      hasAgentOwnerAccess = membership !== null;
      canEditAsAgentOwner = canEditWorkspaceContent(membership?.role ?? null);
    }
  }

  // Check project-level access if action belongs to a project
  let projectAccess = null;
  if (action.projectId) {
    projectAccess = await getProjectAccess(db, userId, action.projectId);
  }

  return {
    isCreator,
    hasAgentOwnerAccess,
    canEditAsAgentOwner,
    isAssignee,
    hasProjectAccess: projectAccess ? hasProjectAccess(projectAccess) : false,
    canEditProject: projectAccess ? canEditProject(projectAccess) : false,
    isProjectInsider: projectAccess ? isProjectInsider(projectAccess) : false,
  };
}

/**
 * The DB-level twin of the agent-owner path: actions whose creator is the
 * shadow user of an agent this user owns, inside a workspace matching
 * `workspace` (the action's own, else its project's) or in no workspace at
 * all. One clause, shared by the read, edit and delete builders, so the three
 * cannot drift; the read builder passes "still a member", the write builders
 * "holds a write role".
 */
function createdByOwnedAgentWhere(
  userId: string,
  workspace: Prisma.WorkspaceWhereInput,
): Prisma.ActionWhereInput {
  return {
    createdBy: { externalAgentShadow: { ownerId: userId } },
    OR: [
      // In its own workspace…
      { workspace },
      // …or, where the action names none, its project's…
      { workspaceId: null, project: { workspace } },
      // …or in no workspace at all: project-less, or in a personal project.
      { workspaceId: null, projectId: null },
      { workspaceId: null, project: { workspaceId: null } },
    ],
  };
}

/** Check if user can view this action */
export function canViewAction(access: ActionAccessInfo): boolean {
  // Creator can always view their own actions
  if (access.isCreator) return true;
  // So can the owner of the agent that created it, while they belong to
  // the action's workspace
  if (access.hasAgentOwnerAccess) return true;
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
  // So can the owner of the agent that created it, at a write role in the
  // action's workspace
  if (access.canEditAsAgentOwner) return true;
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
      // Only the creator, the owner of the agent that created it (at a
      // write role in the action's workspace), or project editors can delete
      return access.isCreator || access.canEditAsAgentOwner || access.canEditProject;
    case "admin":
      return access.isCreator || access.canEditAsAgentOwner || access.canEditProject;
    default:
      return false;
  }
}

/**
 * Build Prisma WHERE clause for actions a user can **view**.
 *
 * READ-ONLY: this grants public-project outsiders and workspace viewers, so it
 * must never scope a write. Use {@link buildActionEditWhere} or
 * {@link buildActionDeleteWhere} for `updateMany` / `deleteMany`.
 *
 * Replaces the old buildUserActionPermissions() function.
 * Used for bulk queries (getAll, getProjectActions, etc.).
 *
 * Restriction model: when an action belongs to a restricted project,
 * only creator/assignee/ProjectMember/workspace-owner-or-admin paths grant
 * access. Workspace `member`/`viewer` and team-as-workspace gateway access
 * to actions in restricted projects are filtered out.
 *
 * Actions with no project (`projectId: null`) are unaffected by restriction.
 * They are personal: the creator, the owner of the agent that created them
 * (while that owner belongs to the action's workspace), and the assignees see
 * them, and nobody else in the workspace does.
 */
export function buildActionAccessWhere(userId: string) {
  return {
    OR: [
      // Created by user
      { createdById: userId },
      // Created by an agent the user owns, in a workspace they still belong to
      createdByOwnedAgentWhere(userId, buildWorkspaceAccessWhere(userId)),
      // Assigned to user
      { assignees: { some: { userId } } },
      // User is the project creator
      { project: { createdById: userId } },
      // User is a direct project member
      { project: { projectMembers: { some: { userId } } } },
      // Action belongs to a public project
      { project: { isPublic: true } },
      // Unrestricted-project paths: team/workspace membership grants access
      {
        project: {
          isRestricted: false,
          OR: [
            { team: { members: { some: { userId } } } },
            { workspace: { members: { some: { userId } } } },
            { workspace: { teams: { some: { members: { some: { userId } } } } } },
          ],
        },
      },
      // Restricted-project escape hatch: workspace owner/admin
      {
        project: {
          isRestricted: true,
          workspace: {
            members: { some: { userId, role: { in: ["owner", "admin"] } } },
          },
        },
      },
    ],
  };
}

/**
 * Actions every member of the workspace may read, whoever they are: for
 * copying into a surface the whole workspace sees (a ceremony agenda
 * snapshot), where a per-viewer filter cannot apply because the text is
 * stored once. Only Actions in an unrestricted or public project of this
 * workspace qualify. A project-less Action is visible only to its creator
 * (and, when an agent created it, the agent's owner) and assignees, and a
 * restricted project's only to its members, so both are left out.
 */
export function buildWorkspaceAudienceActionWhere(workspaceId: string): Prisma.ActionWhereInput {
  return {
    workspaceId,
    project: { workspaceId, OR: [{ isRestricted: false }, { isPublic: true }] },
  };
}

/**
 * Prisma WHERE clause for actions a user can **edit** — the DB-level mirror of
 * {@link canEditAction}: creator, owner of the agent that created it (at a
 * write role in the action's workspace), assignee, or someone who can edit the
 * action's project ({@link buildProjectEditWhere}). Public visibility and a
 * workspace `viewer` role grant nothing here.
 *
 * Use to scope bulk writes (`updateMany`) and to pick the rows a write may touch.
 */
export function buildActionEditWhere(userId: string): Prisma.ActionWhereInput {
  return {
    OR: [
      { createdById: userId },
      createdByOwnedAgentWhere(userId, buildWorkspaceWriteWhere(userId)),
      { assignees: { some: { userId } } },
      { project: buildProjectEditWhere(userId) },
    ],
  };
}

/**
 * Prisma WHERE clause for actions a user can **delete** — the DB-level mirror
 * of `checkActionPermission(access, "delete")`: the creator, the owner of the
 * agent that created it (at a write role in the action's workspace), or a
 * project editor. Being assigned is not enough to hard-delete.
 */
export function buildActionDeleteWhere(userId: string): Prisma.ActionWhereInput {
  return {
    OR: [
      { createdById: userId },
      createdByOwnedAgentWhere(userId, buildWorkspaceWriteWhere(userId)),
      { project: buildProjectEditWhere(userId) },
    ],
  };
}
