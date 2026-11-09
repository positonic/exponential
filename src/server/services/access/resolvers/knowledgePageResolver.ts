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
 * - They hold a **grant** on it (`KnowledgePageMember`, ADR-0080) and still
 *   belong to its workspace. A grant adds to whatever placement allows, in
 *   every mode; with both, the higher level wins. Role "editor" may edit;
 *   "viewer" may only view.
 *
 * A **restricted** (invite-only) Page (ADR-0069) drops the placement paths: it
 * is visible to its owner and its grantees who still belong to its workspace —
 * nobody else, workspace owners/admins included. Project placement grants
 * nothing. Anyone who can edit a page may share it
 * ({@link canShareKnowledgePage}); only the owner restricts it
 * ({@link canManageKnowledgePageAccess}).
 *
 * A **Row** of a Database (ADR-0078 §4, `databaseId` set) has no access of
 * its own: every question about it is answered for the page that holds its
 * database, by the same rules. Rows copy their holding page's placement, but
 * that copy is never consulted here — only the holding page is.
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

/** A grantee's role on a Page (ADR-0069, ADR-0080). */
export type KnowledgePageInviteRole = "viewer" | "editor";

export function isKnowledgePageInviteRole(
  role: string,
): role is KnowledgePageInviteRole {
  return role === "viewer" || role === "editor";
}

export interface KnowledgePageAccessInfo {
  isOwner: boolean;
  /** Restricted (invite-only) page: only the owner and grantees get in (ADR-0069). */
  isInviteOnly: boolean;
  /**
   * The caller's grant role on the page, in any mode (ADR-0080) — null when
   * they hold no grant or no longer belong to the page's workspace.
   */
  inviteRole: KnowledgePageInviteRole | null;
  /** Whether the page is assigned to a project. */
  hasProject: boolean;
  hasProjectAccess: boolean;
  canEditProject: boolean;
  /** Workspace role for project-less pages; null when not a member. */
  workspaceRole: WorkspaceRole | null;
}

/** The page fields the resolver reads. `databaseId` marks a Row (ADR-0078). */
export interface KnowledgePageForAccess {
  id: string;
  createdById: string;
  projectId: string | null;
  workspaceId: string;
  isInviteOnly: boolean;
  databaseId?: string | null;
}

const HOLDING_PAGE_SELECT = {
  id: true,
  createdById: true,
  projectId: true,
  workspaceId: true,
  isInviteOnly: true,
} as const;

/** The page that holds a Row's database, or null when the database is gone. */
async function loadHoldingPage(
  db: PrismaClient,
  databaseId: string,
): Promise<KnowledgePageForAccess | null> {
  const database = await db.pageDatabase.findUnique({
    where: { id: databaseId },
    select: { page: { select: HOLDING_PAGE_SELECT } },
  });
  return database?.page ?? null;
}

/** Access info that admits nobody — a Row whose database no longer exists. */
const NO_ACCESS: KnowledgePageAccessInfo = {
  isOwner: false,
  isInviteOnly: false,
  inviteRole: null,
  hasProject: false,
  hasProjectAccess: false,
  canEditProject: false,
  workspaceRole: null,
};

export async function getKnowledgePageAccess(
  db: PrismaClient,
  userId: string,
  page: KnowledgePageForAccess,
): Promise<KnowledgePageAccessInfo> {
  if (page.databaseId) {
    // A Row answers for its holding page, whose own `databaseId` is always
    // null (a row page cannot hold a database), so this recurses once.
    const holder = await loadHoldingPage(db, page.databaseId);
    return holder ? getKnowledgePageAccess(db, userId, holder) : NO_ACCESS;
  }
  const isOwner = page.createdById === userId;

  // The grant counts in every mode, but only while the grantee still belongs
  // to the page's workspace (the row outlives membership; ADR-0069).
  const [invite, membership, projectAccess] = await Promise.all([
    db.knowledgePageMember.findUnique({
      where: { pageId_userId: { pageId: page.id, userId } },
      select: { role: true },
    }),
    getWorkspaceMembership(db, userId, page.workspaceId),
    page.projectId && !page.isInviteOnly
      ? getProjectAccess(db, userId, page.projectId)
      : Promise.resolve(null),
  ]);
  const inviteRole =
    invite && membership && isKnowledgePageInviteRole(invite.role)
      ? invite.role
      : null;

  if (page.isInviteOnly) {
    // Restricted: project and workspace paths don't apply — only the grant.
    return {
      isOwner,
      isInviteOnly: true,
      inviteRole,
      hasProject: !!page.projectId,
      hasProjectAccess: false,
      canEditProject: false,
      workspaceRole: null,
    };
  }

  // Workspace role decides only project-less pages; a project page's
  // workspace route runs through the project resolver.
  const workspaceRole: WorkspaceRole | null = page.projectId
    ? null
    : (membership?.role ?? null);

  return {
    isOwner,
    isInviteOnly: false,
    inviteRole,
    hasProject: !!page.projectId,
    hasProjectAccess: projectAccess ? hasProjectAccess(projectAccess) : false,
    canEditProject: projectAccess ? canEditProject(projectAccess) : false,
    workspaceRole,
  };
}

/** Check if user can view this page. */
export function canViewKnowledgePage(access: KnowledgePageAccessInfo): boolean {
  if (access.isOwner) return true;
  // A grant admits in every mode (ADR-0080).
  if (access.inviteRole !== null) return true;
  // Restricted: the grant is the only way in (no admin escape hatch).
  if (access.isInviteOnly) return false;
  return inheritedView(access);
}

/** Check if user can edit this page. */
export function canEditKnowledgePage(access: KnowledgePageAccessInfo): boolean {
  if (access.isOwner) return true;
  if (access.inviteRole === "editor") return true;
  if (access.isInviteOnly) return false;
  return inheritedEdit(access);
}

/** View through placement alone: the page's project, or its workspace. */
function inheritedView(access: KnowledgePageAccessInfo): boolean {
  // Project access is authoritative for project-assigned pages.
  if (access.hasProject) return access.hasProjectAccess;
  // Project-less pages: any workspace member (any role) may view.
  return access.workspaceRole !== null;
}

/** Edit through placement alone. */
function inheritedEdit(access: KnowledgePageAccessInfo): boolean {
  if (access.hasProject) return access.canEditProject;
  // Project-less pages: workspace members may edit, except viewers
  // (viewer is a read-only role).
  return access.workspaceRole !== null && access.workspaceRole !== "viewer";
}

/**
 * Who may add people to a page (ADR-0080): anyone who can edit it. A non-owner
 * may change or remove only the grants they added, and may not grant editor to
 * a workspace Viewer — the router enforces both, since they depend on the row.
 */
export function canShareKnowledgePage(access: KnowledgePageAccessInfo): boolean {
  return canEditKnowledgePage(access);
}

/**
 * Who may restrict a page (turn invite-only on or off), publish a restricted
 * page to the web, and change grants someone else added (ADR-0069, ADR-0080).
 * The owner alone, so an editor can never widen a page beyond the owner's
 * choice or undo another person's sharing.
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
  const own = ownPageAccessWhere(userId);
  return {
    OR: [
      // An ordinary page: its own placement decides.
      { AND: [{ databaseId: null }, own] },
      // A Row (ADR-0078 §4): the page holding its database decides, never
      // the row's copied placement.
      { AND: [{ databaseId: { not: null } }, { database: { page: own } }] },
    ],
  };
}

/** The access clause for a page judged on its own placement (not a Row). */
function ownPageAccessWhere(userId: string): Prisma.KnowledgePageWhereInput {
  return {
    OR: [
      // Page owner
      { createdById: userId },
      // Grantees still in the page's workspace, in every mode — on a
      // restricted page this is the only way in besides ownership (ADR-0080)
      {
        AND: [
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
  page: KnowledgePageForAccess,
): Promise<{ isPublicProject: boolean; viewers: KnowledgePageViewer[] }> {
  if (page.databaseId) {
    const holder = await loadHoldingPage(db, page.databaseId);
    return holder
      ? listKnowledgePageViewers(db, holder)
      : { isPublicProject: false, viewers: [] };
  }
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

  const [
    workspaceUsers,
    workspaceTeamUsers,
    projectMembers,
    projectTeamUsers,
    grants,
  ] = await Promise.all([
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
      db.knowledgePageMember.findMany({
        where: { pageId: page.id },
        select: { userId: true, role: true },
      }),
    ]);
  // A grant counts only while the grantee belongs to the page's workspace —
  // the same membership test the per-user resolver runs.
  const grantMembers = await filterWorkspaceMembers(
    db,
    page.workspaceId,
    grants.map((g) => g.userId),
  );
  const grantRoles = new Map<string, KnowledgePageInviteRole>();
  for (const { userId, role } of grants) {
    if (grantMembers.has(userId) && isKnowledgePageInviteRole(role)) {
      grantRoles.set(userId, role);
    }
  }

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
    ...grantRoles.keys(),
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
      inviteRole: grantRoles.get(userId) ?? null,
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
        access.inviteRole === null &&
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
