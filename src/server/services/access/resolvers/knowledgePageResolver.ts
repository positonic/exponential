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
