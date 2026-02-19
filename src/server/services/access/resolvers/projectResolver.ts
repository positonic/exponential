/**
 * Project Access Resolver
 *
 * Resolves project access through all possible paths:
 * - Direct ownership (createdById)
 * - Direct membership (ProjectMember)
 * - Team membership (project's team)
 * - Workspace membership (project's workspace)
 * - Public flag
 */

import type { PrismaClient } from "@prisma/client";
import type { ProjectAccess, TeamRole, WorkspaceRole } from "../types";
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
    },
  });

  if (!project) {
    return {
      isCreator: false,
      isMember: false,
      isTeamMember: false,
      isWorkspaceMember: false,
      isPublic: false,
    };
  }

  const isCreator = project.createdById === userId;
  const isPublic = project.isPublic;

  // Check direct project membership
  const projectMember = await db.projectMember.findFirst({
    where: { projectId, userId },
  });
  const isMember = !!projectMember;

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
    teamRole,
    workspaceRole,
  };
}

/** Check if user has any access to a project (any path) */
export function hasProjectAccess(access: ProjectAccess): boolean {
  return (
    access.isCreator ||
    access.isMember ||
    access.isTeamMember ||
    access.isWorkspaceMember ||
    access.isPublic
  );
}

/** Check if user can edit a project (creator, workspace admin+, team admin+) */
export function canEditProject(access: ProjectAccess): boolean {
  if (access.isCreator) return true;
  if (access.workspaceRole === "owner" || access.workspaceRole === "admin") return true;
  if (access.teamRole === "owner" || access.teamRole === "admin") return true;
  return false;
}
