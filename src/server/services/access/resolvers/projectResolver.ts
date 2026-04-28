/**
 * Project Access Resolver
 *
 * Resolves project access through all possible paths:
 * - Direct ownership (createdById)
 * - Direct membership (ProjectMember)
 * - Team membership (project's team)
 * - Workspace membership (project's workspace)
 * - Public flag
 *
 * Restriction model:
 * When `Project.isRestricted = true`, only the creator, ProjectMembers, and
 * workspace owners/admins (escape hatch) can access the project. Workspace
 * `member`/`viewer` and team-as-workspace gateway access are NOT granted.
 * `isPublic` overrides restriction for view (public is public).
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ProjectAccess,
  ProjectMemberRole,
  TeamRole,
  WorkspaceRole,
} from "../types";
import { hasMinimumProjectRole } from "../types";
import { getWorkspaceMembership } from "./workspaceResolver";

export async function getProjectAccess(
  db: PrismaClient,
  userId: string,
  projectId: string,
): Promise<ProjectAccess> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      createdById: true,
      teamId: true,
      workspaceId: true,
      isPublic: true,
      isRestricted: true,
    },
  });

  if (!project) {
    return {
      isCreator: false,
      isMember: false,
      isTeamMember: false,
      isWorkspaceMember: false,
      isPublic: false,
      isRestricted: false,
    };
  }

  const isCreator = project.createdById === userId;
  const isPublic = project.isPublic;
  const isRestricted = project.isRestricted;

  // Check direct project membership
  const projectMember = await db.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  });
  const isMember = !!projectMember;
  const memberRole = projectMember
    ? (projectMember.role as ProjectMemberRole)
    : undefined;

  // Check team membership (if project has a team)
  let isTeamMember = false;
  let teamRole: TeamRole | undefined;
  if (project.teamId) {
    const teamMembership = await db.teamUser.findUnique({
      where: { userId_teamId: { userId, teamId: project.teamId } },
      select: { role: true },
    });
    if (teamMembership) {
      isTeamMember = true;
      teamRole = teamMembership.role as TeamRole;
    }
  }

  // Check workspace membership (if project has a workspace)
  // Uses getWorkspaceMembership which checks both direct WorkspaceUser
  // and team-based access (user in a team linked to the workspace)
  let isWorkspaceMember = false;
  let workspaceRole: WorkspaceRole | undefined;
  if (project.workspaceId) {
    const wsMembership = await getWorkspaceMembership(db, userId, project.workspaceId);
    if (wsMembership) {
      isWorkspaceMember = true;
      workspaceRole = wsMembership.role;
    }
  }

  return {
    isCreator,
    isMember,
    isTeamMember,
    isWorkspaceMember,
    isPublic,
    isRestricted,
    memberRole,
    teamRole,
    workspaceRole,
  };
}

/**
 * Workspace owners/admins bypass project restriction (escape hatch — prevents
 * a project from being permanently locked when its admin leaves).
 */
function isWorkspaceEscapeHatch(access: ProjectAccess): boolean {
  return access.workspaceRole === "owner" || access.workspaceRole === "admin";
}

/** Check if user has any access to a project (any path) */
export function hasProjectAccess(access: ProjectAccess): boolean {
  if (access.isPublic) return true;
  if (access.isCreator) return true;
  if (access.isMember) return true;
  if (access.isRestricted) {
    return isWorkspaceEscapeHatch(access);
  }
  return access.isTeamMember || access.isWorkspaceMember;
}

/** Check if user can edit a project */
export function canEditProject(access: ProjectAccess): boolean {
  if (access.isCreator) return true;
  if (access.isRestricted) {
    if (
      access.memberRole &&
      hasMinimumProjectRole(access.memberRole, "editor")
    ) {
      return true;
    }
    return isWorkspaceEscapeHatch(access);
  }
  // Unrestricted: any member, team member, or workspace member can edit
  if (access.isMember) return true;
  if (access.isTeamMember) return true;
  if (access.isWorkspaceMember) return true;
  return false;
}

/** Check if user can manage members (add/remove/role) on a project */
export function canManageProjectMembers(access: ProjectAccess): boolean {
  if (access.isCreator) return true;
  if (access.memberRole === "admin") return true;
  return isWorkspaceEscapeHatch(access);
}

/**
 * Prisma WHERE clause for projects a user can access.
 *
 * Use for bulk queries (getAll, getProjectsWithActions, etc.) so that
 * restricted projects are filtered out at the database level.
 */
export function buildProjectAccessWhere(
  userId: string,
): Prisma.ProjectWhereInput {
  return {
    OR: [
      { createdById: userId },
      { isPublic: true },
      { projectMembers: { some: { userId } } },
      // Unrestricted projects: any team/workspace path grants access
      {
        AND: [
          { isRestricted: false },
          {
            OR: [
              { team: { members: { some: { userId } } } },
              { workspace: { members: { some: { userId } } } },
              {
                workspace: {
                  teams: { some: { members: { some: { userId } } } },
                },
              },
            ],
          },
        ],
      },
      // Restricted projects: workspace owner/admin escape hatch
      {
        AND: [
          { isRestricted: true },
          {
            workspace: {
              members: {
                some: { userId, role: { in: ["owner", "admin"] } },
              },
            },
          },
        ],
      },
    ],
  };
}
