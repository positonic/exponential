/**
 * Workspace Access Resolver
 *
 * Resolves workspace membership and role for a given user.
 * Single source of truth for "does this user belong to this workspace?"
 *
 * Access is granted via two paths:
 * 1. Direct membership: user has a WorkspaceUser record
 * 2. Team membership: user is in a team linked to the workspace (Team.workspaceId)
 */

import type { PrismaClient } from "@prisma/client";
import type { WorkspaceMembership, WorkspaceRole } from "../types";

export async function getWorkspaceMembership(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership | null> {
  // 1. Check direct workspace membership
  const membership = await db.workspaceUser.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { role: true, workspaceId: true },
  });

  if (membership) {
    return {
      role: membership.role as WorkspaceRole,
      workspaceId: membership.workspaceId,
    };
  }

  // 2. Fallback: check team-based workspace access
  //    User is a member of a team that is linked to this workspace
  const teamMembership = await db.teamUser.findFirst({
    where: {
      userId,
      team: { workspaceId },
    },
    select: {
      role: true,
      team: { select: { workspaceId: true } },
    },
  });

  if (teamMembership?.team.workspaceId) {
    return {
      role: "member" as WorkspaceRole,
      workspaceId: teamMembership.team.workspaceId,
    };
  }

  return null;
}

/**
 * Build a Prisma WHERE clause that matches workspaces the user can access,
 * either via direct WorkspaceUser membership or via team membership.
 *
 * Strict: project-only members (guests) are NOT matched by this helper.
 * Use `buildWorkspaceVisibilityWhere` when you need to include guests.
 */
export function buildWorkspaceAccessWhere(userId: string) {
  return {
    OR: [
      // Direct workspace membership
      { members: { some: { userId } } },
      // Team-based workspace access: user is in a team linked to this workspace
      { teams: { some: { members: { some: { userId } } } } },
    ],
  };
}

/**
 * Build a Prisma WHERE clause that matches workspaces the user can SEE,
 * including project-only members ("guests").
 *
 * A user is a guest of workspace W when they have a `ProjectMember` row in
 * a project belonging to W but no direct `WorkspaceUser` row for W and no
 * team-based access. This helper surfaces W to them so workspace context
 * (switcher, top bar, project list) renders for guests.
 *
 * For "full workspace privileges" checks (settings, member management,
 * unrestricted resource access), keep using the strict
 * `buildWorkspaceAccessWhere`.
 */
export function buildWorkspaceVisibilityWhere(userId: string) {
  return {
    OR: [
      // Direct workspace membership
      { members: { some: { userId } } },
      // Team-based workspace access
      { teams: { some: { members: { some: { userId } } } } },
      // Project-only access ("guest"): user is a ProjectMember of some
      // project belonging to this workspace.
      { projects: { some: { projectMembers: { some: { userId } } } } },
    ],
  };
}

/**
 * True when the user has derived ("guest") workspace access only:
 * a `ProjectMember` row in some project of the workspace, but no direct
 * `WorkspaceUser` row and no team-based access.
 *
 * Used to scope queries (e.g. project listings) down to the guest's
 * explicitly-shared projects, and to drive the stripped-down UI.
 */
export async function isWorkspaceGuest(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const directMembership = await db.workspaceUser.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { userId: true },
  });
  if (directMembership) return false;

  const teamMembership = await db.teamUser.findFirst({
    where: { userId, team: { workspaceId } },
    select: { id: true },
  });
  if (teamMembership) return false;

  const projectMember = await db.projectMember.findFirst({
    where: { userId, project: { workspaceId } },
    select: { id: true },
  });
  return projectMember !== null;
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

/**
 * Look up a User by email and return basic fields if they are a member of the
 * given workspace. Returns null if the user does not exist or is not a member.
 *
 * Used by the one2b agent integration to resolve action assignees by email.
 */
export async function findUserByEmailInWorkspace(
  email: string,
  workspaceId: string,
): Promise<{ id: string; email: string; name: string | null } | null> {
  // Lazy import: keeps this module free of the global Prisma client at
  // import time, so unit tests can import the other resolvers without a DB.
  const { db } = await import("~/server/db");
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (!user?.email) {
    return null;
  }

  const membership = await db.workspaceUser.findUnique({
    where: {
      userId_workspaceId: { userId: user.id, workspaceId },
    },
    select: { userId: true },
  });

  if (!membership) {
    return null;
  }

  return { id: user.id, email: user.email, name: user.name };
}
