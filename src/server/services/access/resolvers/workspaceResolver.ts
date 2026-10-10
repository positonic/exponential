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

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import type { WorkspaceMembership, WorkspaceRole } from "../types";
import { WORKSPACE_ROLE_HIERARCHY } from "../types";

/**
 * Can this workspace role create or modify workspace content?
 *
 * Membership alone is NOT the answer: `viewer` is a read-only role and `guest`
 * is synthesized for project-only access, so both must be refused. Callers that
 * merely assert membership let a viewer write — use this (or
 * `assertWorkspaceWriteRole`, which throws) wherever a write is about to happen.
 */
export function canEditWorkspaceContent(role: WorkspaceRole | null): boolean {
  if (!role) return false;
  return WORKSPACE_ROLE_HIERARCHY[role] >= WORKSPACE_ROLE_HIERARCHY.member;
}

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
 * Batch form of {@link getWorkspaceMembership}'s yes/no: which of `userIds`
 * belong to the workspace, directly or via a team linked to it.
 */
export async function filterWorkspaceMembers(
  db: PrismaClient,
  workspaceId: string,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const [direct, viaTeam] = await Promise.all([
    db.workspaceUser.findMany({
      where: { workspaceId, userId: { in: userIds } },
      select: { userId: true },
    }),
    db.teamUser.findMany({
      where: { team: { workspaceId }, userId: { in: userIds } },
      select: { userId: true },
    }),
  ]);
  return new Set([...direct, ...viaTeam].map((m) => m.userId));
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

/**
 * Assert that the user holds one of `allowedRoles` in the workspace, throwing
 * `FORBIDDEN` otherwise. Returns the resolved role so callers can branch further.
 *
 * This is the centralized replacement for the
 * `member.role !== "owner" && member.role !== "admin"` shape that `workspace.ts`
 * open-codes in about ten places. Reach for it whenever a workspace-level
 * privileged action needs gating — CLAUDE.md forbids adding another inline copy.
 *
 * Note that team-based access resolves to `member` (see `getWorkspaceMembership`),
 * so a user who reaches the workspace only through a team is correctly refused an
 * owner/admin gate.
 */
export async function assertWorkspaceRole(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  allowedRoles: readonly WorkspaceRole[],
): Promise<WorkspaceRole> {
  const membership = await getWorkspaceMembership(db, userId, workspaceId);

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this workspace.",
    });
  }

  if (!allowedRoles.includes(membership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `This action requires the ${formatRoleList(allowedRoles)} role.`,
    });
  }

  return membership.role;
}

/**
 * Assert that the user is a member of the workspace (any role, directly or via
 * a team), throwing `FORBIDDEN` otherwise. Returns the membership.
 *
 * This is the READ gate: it admits `viewer`. Never use it alone in front of a
 * write — use `assertWorkspaceWriteRole` there.
 */
export async function assertWorkspaceMembership(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership> {
  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this workspace.",
    });
  }
  return membership;
}

/**
 * Assert that the user may create or modify content in the workspace, i.e.
 * holds `owner`, `admin` or `member`. Viewers and guests (and non-members)
 * are refused with `FORBIDDEN`. Returns the membership so callers can branch.
 *
 * This is the write-side counterpart of a bare membership check: every
 * mutation that only asserted "is a member" let a read-only `viewer` write.
 * Use it (or a wrapper that delegates to it) on every workspace-scoped write.
 */
export async function assertWorkspaceWriteRole(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership> {
  const membership = await getWorkspaceMembership(db, userId, workspaceId);

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this workspace.",
    });
  }

  if (!canEditWorkspaceContent(membership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You need owner, admin, or member access to this workspace to make changes.",
    });
  }

  return membership;
}

function formatRoleList(roles: readonly WorkspaceRole[]): string {
  if (roles.length <= 1) return roles[0] ?? "owner";
  return `${roles.slice(0, -1).join(", ")} or ${roles[roles.length - 1]}`;
}
