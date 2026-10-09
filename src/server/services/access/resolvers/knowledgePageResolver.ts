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
 *
 * An **invite-only** Page (ADR-0067) replaces the last two paths entirely: it
 * is visible to its owner and its invitees (`KnowledgePageMember`) who still
 * belong to its workspace — nobody else, workspace owners/admins included.
 * Project placement grants nothing. Invitee role "editor" may edit; "viewer"
 * may only view. Only the owner manages access ({@link canManageKnowledgePageAccess}).
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
  filterWorkspaceMembers,
} from "./workspaceResolver";

/** An invitee's role on an invite-only Page (ADR-0067). */
export type KnowledgePageInviteRole = "viewer" | "editor";

export function isKnowledgePageInviteRole(
  role: string,
): role is KnowledgePageInviteRole {
  return role === "viewer" || role === "editor";
}

export interface KnowledgePageAccessInfo {
  isOwner: boolean;
  /** Invite-only page: only the owner and invitees get in (ADR-0067). */
  isInviteOnly: boolean;
  /**
   * The caller's invite role on an invite-only page — null when not invited,
   * when no longer a member of the page's workspace, or on any other page.
   */
  inviteRole: KnowledgePageInviteRole | null;
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
    id: string;
    createdById: string;
    projectId: string | null;
    workspaceId: string;
    isInviteOnly: boolean;
  },
): Promise<KnowledgePageAccessInfo> {
  const isOwner = page.createdById === userId;

  if (page.isInviteOnly) {
    // Project and workspace paths don't apply — only the invite does, and
    // only while the invitee still belongs to the page's workspace.
    const [invite, membership] = await Promise.all([
      db.knowledgePageMember.findUnique({
        where: { pageId_userId: { pageId: page.id, userId } },
        select: { role: true },
      }),
      getWorkspaceMembership(db, userId, page.workspaceId),
    ]);
    return {
      isOwner,
      isInviteOnly: true,
      inviteRole:
        invite && membership && isKnowledgePageInviteRole(invite.role)
          ? invite.role
          : null,
      hasProject: !!page.projectId,
      hasProjectAccess: false,
      canEditProject: false,
      workspaceRole: null,
    };
  }

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
    isInviteOnly: false,
    inviteRole: null,
    hasProject: !!page.projectId,
    hasProjectAccess: projectAccess ? hasProjectAccess(projectAccess) : false,
    canEditProject: projectAccess ? canEditProject(projectAccess) : false,
    workspaceRole,
  };
}

/** Check if user can view this page. */
export function canViewKnowledgePage(access: KnowledgePageAccessInfo): boolean {
  if (access.isOwner) return true;
  // Invite-only: the invite is the only way in (no admin escape hatch).
  if (access.isInviteOnly) return access.inviteRole !== null;
  // Project access is authoritative for project-assigned pages.
  if (access.hasProject) return access.hasProjectAccess;
  // Project-less pages: any workspace member (any role) may view.
  return access.workspaceRole !== null;
}

/** Check if user can edit this page. */
export function canEditKnowledgePage(access: KnowledgePageAccessInfo): boolean {
  if (access.isOwner) return true;
  if (access.isInviteOnly) return access.inviteRole === "editor";
  if (access.hasProject) return access.canEditProject;
  // Project-less pages: workspace members may edit, except viewers
  // (viewer is a read-only role).
  return access.workspaceRole !== null && access.workspaceRole !== "viewer";
}

/**
 * Who may change a page's sharing — its invite-only mode and its invitees, and
 * publish an invite-only page to the web (ADR-0067). The owner alone, so an
 * invited editor can never widen a page they were let into.
 */
export function canManageKnowledgePageAccess(
  access: KnowledgePageAccessInfo,
): boolean {
  return access.isOwner;
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
      // Invite-only pages: invitees still in the page's workspace, nobody else
      {
        AND: [
          { isInviteOnly: true },
          { members: { some: { userId } } },
          { workspace: buildWorkspaceAccessWhere(userId) },
        ],
      },
      {
        AND: [
          { isInviteOnly: false },
          {
            OR: [
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
          },
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
    id: string;
    createdById: string;
    projectId: string | null;
    workspaceId: string;
    isInviteOnly: boolean;
  },
): Promise<{ isPublicProject: boolean; viewers: KnowledgePageViewer[] }> {
  if (page.isInviteOnly) {
    return {
      isPublicProject: false,
      viewers: await listInviteOnlyViewers(db, page),
    };
  }

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
      isInviteOnly: false,
      inviteRole: null,
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

/**
 * Viewers of an invite-only page: the owner plus invitees who still belong to
 * the page's workspace (direct or via a workspace-linked team) — the same test
 * `getKnowledgePageAccess` applies per user, batch-loaded.
 */
async function listInviteOnlyViewers(
  db: PrismaClient,
  page: { id: string; createdById: string; workspaceId: string },
): Promise<KnowledgePageViewer[]> {
  const invites = await db.knowledgePageMember.findMany({
    where: { pageId: page.id },
    select: { userId: true, role: true },
  });
  const stillMembers = await filterWorkspaceMembers(
    db,
    page.workspaceId,
    invites.map((i) => i.userId),
  );

  const viewers: KnowledgePageViewer[] = [
    { userId: page.createdById, viaAdminEscapeHatch: false },
  ];
  for (const invite of invites) {
    if (invite.userId === page.createdById) continue;
    const access: KnowledgePageAccessInfo = {
      isOwner: false,
      isInviteOnly: true,
      inviteRole:
        stillMembers.has(invite.userId) && isKnowledgePageInviteRole(invite.role)
          ? invite.role
          : null,
      hasProject: false,
      hasProjectAccess: false,
      canEditProject: false,
      workspaceRole: null,
    };
    if (canViewKnowledgePage(access)) {
      viewers.push({ userId: invite.userId, viaAdminEscapeHatch: false });
    }
  }
  return viewers;
}
