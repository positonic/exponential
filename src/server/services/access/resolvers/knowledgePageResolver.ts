/**
 * KnowledgePage (Page) Access Resolver
 *
 * Single source of truth for Page visibility (ADR-0033), which deliberately
 * mirrors Meeting visibility (see {@link ./transcriptionResolver}) minus the
 * participant concept — a Page has no attendees. A user can view a Page when
 * any of these hold:
 * - They created it (page owner).
 * - It is assigned to a project they can access (project access is
 *   authoritative — a workspace member without project access is denied,
 *   restricted-project allowlist included).
 * - It has no project and they are a member of its workspace (any role may
 *   view; edit requires a non-viewer role).
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { WorkspaceRole } from "../types";
import {
  getProjectAccess,
  hasProjectAccess,
  canEditProject,
  buildProjectAccessWhere,
} from "./projectResolver";
import {
  getWorkspaceMembership,
  buildWorkspaceAccessWhere,
} from "./workspaceResolver";

export interface KnowledgePageAccessInfo {
  isOwner: boolean;
  /** Whether the page is assigned to a project. */
  hasProject: boolean;
  hasProjectAccess: boolean;
  canEditProject: boolean;
  /** Workspace role for project-less pages; null when not a member. */
  workspaceRole: WorkspaceRole | null;
}

export async function getKnowledgePageAccess(
  db: PrismaClient,
  userId: string,
  page: {
    createdById: string;
    projectId: string | null;
    workspaceId: string;
  },
): Promise<KnowledgePageAccessInfo> {
  const isOwner = page.createdById === userId;

  let projectAccess = null;
  if (page.projectId) {
    projectAccess = await getProjectAccess(db, userId, page.projectId);
  }

  let workspaceRole: WorkspaceRole | null = null;
  if (!page.projectId) {
    const membership = await getWorkspaceMembership(
      db,
      userId,
      page.workspaceId,
    );
    workspaceRole = membership?.role ?? null;
  }

  return {
    isOwner,
    hasProject: !!page.projectId,
    hasProjectAccess: projectAccess ? hasProjectAccess(projectAccess) : false,
    canEditProject: projectAccess ? canEditProject(projectAccess) : false,
    workspaceRole,
  };
}

/** Check if user can view this page. */
export function canViewKnowledgePage(access: KnowledgePageAccessInfo): boolean {
  if (access.isOwner) return true;
  // Project access is authoritative for project-assigned pages.
  if (access.hasProject) return access.hasProjectAccess;
  // Project-less pages: any workspace member (any role) may view.
  return access.workspaceRole !== null;
}

/** Check if user can edit this page. */
export function canEditKnowledgePage(access: KnowledgePageAccessInfo): boolean {
  if (access.isOwner) return true;
  if (access.hasProject) return access.canEditProject;
  // Project-less pages: workspace members may edit, except viewers
  // (viewer is a read-only role).
  return access.workspaceRole !== null && access.workspaceRole !== "viewer";
}

/**
 * Prisma WHERE clause for pages a user can access.
 *
 * Use for every bulk read over Pages (list, search, embedding sweeps) so all
 * surfaces show the same set. Mirrors `getKnowledgePageAccess` exactly.
 */
export function buildKnowledgePageAccessWhere(
  userId: string,
): Prisma.KnowledgePageWhereInput {
  return {
    OR: [
      // Page owner
      { createdById: userId },
      // Project-assigned pages: project access is authoritative
      { project: buildProjectAccessWhere(userId) },
      // Project-less pages: workspace membership (direct or via team)
      {
        AND: [
          { projectId: null },
          { workspace: buildWorkspaceAccessWhere(userId) },
        ],
      },
    ],
  };
}

/** One person who can view a Page, as {@link listKnowledgePageViewers} finds them. */
export interface KnowledgePageViewer {
  userId: string;
  /**
   * True when their only route in is the workspace owner/admin escape hatch on
   * a restricted project — the share popover calls this out, because people
   * expect "restricted" to mean "members only".
   */
  viaAdminEscapeHatch: boolean;
}

/**
 * Everyone who can view a Page — the inverse of {@link getKnowledgePageAccess}.
 *
 * Loads every membership row that could grant access in a handful of batch
 * queries (not one resolver call per person), then runs each candidate through
 * the same decision functions the per-user resolver uses (`hasProjectAccess`,
 * `canViewKnowledgePage`), so the two cannot disagree on the rules — only on
 * data loading, which the parity test covers.
 *
 * Returns `isPublicProject: true` with no viewers for a page in a public
 * project: every signed-in user can view it, so there is no list to show.
 */
export async function listKnowledgePageViewers(
  db: PrismaClient,
  page: {
    createdById: string;
    projectId: string | null;
    workspaceId: string;
  },
): Promise<{ isPublicProject: boolean; viewers: KnowledgePageViewer[] }> {
  const project = page.projectId
    ? await db.project.findUnique({
        where: { id: page.projectId },
        select: {
          createdById: true,
          teamId: true,
          workspaceId: true,
          isPublic: true,
          isRestricted: true,
        },
      })
    : null;
  if (project?.isPublic) return { isPublicProject: true, viewers: [] };

  // Project-access workspace is the project's own (as in getProjectAccess);
  // a project-less page uses its own workspace.
  const workspaceId = page.projectId ? project?.workspaceId : page.workspaceId;

  const [workspaceUsers, workspaceTeamUsers, projectMembers, projectTeamUsers] =
    await Promise.all([
      workspaceId
        ? db.workspaceUser.findMany({
            where: { workspaceId },
            select: { userId: true, role: true },
          })
        : [],
      workspaceId
        ? db.teamUser.findMany({
            where: { team: { workspaceId } },
            select: { userId: true },
          })
        : [],
      page.projectId
        ? db.projectMember.findMany({
            where: { projectId: page.projectId },
            select: { userId: true },
          })
        : [],
      project?.teamId
        ? db.teamUser.findMany({
            where: { teamId: project.teamId },
            select: { userId: true },
          })
        : [],
    ]);

  // Workspace role per user: a direct WorkspaceUser row wins; otherwise a team
  // linked to the workspace grants "member" (getWorkspaceMembership's fallback).
  const workspaceRoles = new Map<string, WorkspaceRole>();
  for (const { userId } of workspaceTeamUsers) {
    workspaceRoles.set(userId, "member");
  }
  for (const { userId, role } of workspaceUsers) {
    workspaceRoles.set(userId, role as WorkspaceRole);
  }
  const projectMemberIds = new Set(projectMembers.map((m) => m.userId));
  const projectTeamIds = new Set(projectTeamUsers.map((m) => m.userId));

  const candidates = new Set<string>([
    page.createdById,
    ...workspaceRoles.keys(),
    ...projectMemberIds,
    ...projectTeamIds,
  ]);
  if (project) candidates.add(project.createdById);

  const viewers: KnowledgePageViewer[] = [];
  for (const userId of candidates) {
    const workspaceRole = workspaceRoles.get(userId) ?? null;
    const projectAccess = page.projectId
      ? {
          isCreator: project?.createdById === userId,
          isMember: projectMemberIds.has(userId),
          isTeamMember: projectTeamIds.has(userId),
          isWorkspaceMember: workspaceRole !== null,
          isPublic: false,
          isRestricted: project?.isRestricted ?? false,
          workspaceRole: workspaceRole ?? undefined,
        }
      : null;
    const access: KnowledgePageAccessInfo = {
      isOwner: page.createdById === userId,
      hasProject: !!page.projectId,
      hasProjectAccess: projectAccess ? hasProjectAccess(projectAccess) : false,
      // View-only question; edit rights don't affect who is in the audience.
      canEditProject: false,
      workspaceRole: page.projectId ? null : workspaceRole,
    };
    if (!canViewKnowledgePage(access)) continue;
    viewers.push({
      userId,
      viaAdminEscapeHatch:
        !!projectAccess?.isRestricted &&
        !access.isOwner &&
        !projectAccess.isCreator &&
        !projectAccess.isMember,
    });
  }

  return { isPublicProject: false, viewers };
}
