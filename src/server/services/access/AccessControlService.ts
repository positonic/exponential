/**
 * Centralized Access Control Service
 *
 * Single entry point for all authorization checks in the application.
 * Delegates to resource-specific resolvers for the actual logic.
 *
 * Usage:
 *   const access = new AccessControlService(ctx.db);
 *   const result = await access.canAccess({ userId, resourceType: 'action', resourceId, permission: 'edit' });
 *   if (!result.allowed) throw new TRPCError({ code: 'FORBIDDEN', message: result.reason });
 */

import type { PrismaClient } from "@prisma/client";
import type {
  AccessCheckInput,
  AccessResult,
  Permission,
} from "./types";
import {
  hasMinimumWorkspaceRole,
  hasMinimumTeamRole,
  WORKSPACE_PERMISSION_MAP,
  TEAM_PERMISSION_MAP,
} from "./types";
import { getWorkspaceMembership } from "./resolvers/workspaceResolver";
import { getTeamMembership } from "./resolvers/teamResolver";
import {
  getProjectAccess,
  hasProjectAccess as checkProjectAccess,
  canEditProject,
} from "./resolvers/projectResolver";
import {
  getActionAccess,
  checkActionPermission,
} from "./resolvers/actionResolver";

export class AccessControlService {
  constructor(private db: PrismaClient) {}

  /** Main entry point: can this user perform this action on this resource? */
  async canAccess(input: AccessCheckInput): Promise<AccessResult> {
    const { userId, resourceType, resourceId, permission } = input;

    switch (resourceType) {
      case "workspace":
        return this.checkWorkspaceAccess(userId, resourceId, permission);
      case "team":
        return this.checkTeamAccess(userId, resourceId, permission);
      case "project":
        return this.checkProjectAccess(userId, resourceId, permission);
      case "action":
        return this.checkActionAccess(userId, resourceId, permission);
      default:
        return { allowed: false, reason: `Unsupported resource type: ${resourceType}` };
    }
  }

  // ── Workspace ───────────────────────────────────────────────────
  private async checkWorkspaceAccess(
    userId: string,
    workspaceId: string,
    permission: Permission,
  ): Promise<AccessResult> {
    const membership = await getWorkspaceMembership(this.db, userId, workspaceId);

    if (!membership) {
      return { allowed: false, reason: "Not a workspace member" };
    }

    const minimumRole = WORKSPACE_PERMISSION_MAP[permission];
    if (hasMinimumWorkspaceRole(membership.role, minimumRole)) {
      return {
        allowed: true,
        reason: `Workspace ${membership.role} has ${permission} permission`,
        accessPath: `workspace:${membership.role}`,
        effectiveRole: membership.role,
      };
    }

    return {
      allowed: false,
      reason: `Workspace role '${membership.role}' insufficient for '${permission}' (requires '${minimumRole}')`,
    };
  }

  // ── Team ────────────────────────────────────────────────────────
  private async checkTeamAccess(
    userId: string,
    teamId: string,
    permission: Permission,
  ): Promise<AccessResult> {
    const membership = await getTeamMembership(this.db, userId, teamId);

    if (!membership) {
      return { allowed: false, reason: "Not a team member" };
    }

    const minimumRole = TEAM_PERMISSION_MAP[permission];
    if (hasMinimumTeamRole(membership.role, minimumRole)) {
      return {
        allowed: true,
        reason: `Team ${membership.role} has ${permission} permission`,
        accessPath: `team:${membership.role}`,
        effectiveRole: membership.role,
      };
    }

    return {
      allowed: false,
      reason: `Team role '${membership.role}' insufficient for '${permission}' (requires '${minimumRole}')`,
    };
  }

  // ── Project ─────────────────────────────────────────────────────
  private async checkProjectAccess(
    userId: string,
    projectId: string,
    permission: Permission,
  ): Promise<AccessResult> {
    const access = await getProjectAccess(this.db, userId, projectId);

    if (permission === "view") {
      if (checkProjectAccess(access)) {
        const path = access.isCreator
          ? "owner"
          : access.isMember
            ? "project:member"
            : access.isTeamMember
              ? `team:${access.teamRole}`
              : access.isWorkspaceMember
                ? `workspace:${access.workspaceRole}`
                : "public";
        return { allowed: true, reason: "Has project access", accessPath: path };
      }
      return { allowed: false, reason: "No project access" };
    }

    if (permission === "edit" || permission === "assign") {
      if (canEditProject(access)) {
        const path = access.isCreator
          ? "owner"
          : access.workspaceRole === "owner" || access.workspaceRole === "admin"
            ? `workspace:${access.workspaceRole}`
            : `team:${access.teamRole}`;
        return { allowed: true, reason: "Can edit project", accessPath: path };
      }
      return { allowed: false, reason: "Cannot edit project" };
    }

    if (permission === "delete" || permission === "admin") {
      if (access.isCreator) {
        return { allowed: true, reason: "Project creator", accessPath: "owner" };
      }
      if (access.workspaceRole === "owner") {
        return { allowed: true, reason: "Workspace owner", accessPath: "workspace:owner" };
      }
      return { allowed: false, reason: "Only creator or workspace owner can delete" };
    }

    return { allowed: false, reason: `Unsupported permission: ${permission}` };
  }

  // ── Action ──────────────────────────────────────────────────────
  private async checkActionAccess(
    userId: string,
    actionId: string,
    permission: Permission,
  ): Promise<AccessResult> {
    const access = await getActionAccess(this.db, userId, actionId);

    if (!access) {
      return { allowed: false, reason: "Action not found" };
    }

    if (checkActionPermission(access, permission)) {
      const path = access.isCreator
        ? "owner"
        : access.isAssignee
          ? "assignee"
          : access.canEditProject
            ? "project:editor"
            : "project:viewer";
      return { allowed: true, reason: "Has action access", accessPath: path };
    }

    return { allowed: false, reason: `No ${permission} access to action` };
  }
}
