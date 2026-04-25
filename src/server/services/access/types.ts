/**
 * Centralized Access Control Types
 *
 * Defines the permission model, resource types, and role hierarchy
 * used across the application.
 */

import type { PrismaClient } from "@prisma/client";

// ── Permission Actions ──────────────────────────────────────────────
export type Permission = "view" | "edit" | "delete" | "assign" | "manage_members" | "admin";

// ── Resource Types ──────────────────────────────────────────────────
export type ResourceType =
  | "workspace"
  | "team"
  | "project"
  | "action"
  | "goal"
  | "outcome"
  | "keyResult"
  | "okrCheckin"
  | "view"
  | "list"
  | "crmContact";

// ── Role Definitions ────────────────────────────────────────────────
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type TeamRole = "owner" | "admin" | "member";
export type ProjectRole = "creator" | "member";

// ── Role Hierarchy (higher index = more permissions) ────────────────
export const WORKSPACE_ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export const TEAM_ROLE_HIERARCHY: Record<TeamRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

// ── Access Context ──────────────────────────────────────────────────
export interface AccessCheckInput {
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
  permission: Permission;
}

export interface AccessResult {
  allowed: boolean;
  reason: string;
  accessPath?: string; // e.g. "workspace:admin", "team:member", "owner", "assignee"
  effectiveRole?: string;
}

// ── Membership Info (returned by resolvers) ─────────────────────────
export interface WorkspaceMembership {
  role: WorkspaceRole;
  workspaceId: string;
}

export interface TeamMembership {
  role: TeamRole;
  teamId: string;
}

export interface ProjectAccess {
  isCreator: boolean;
  isMember: boolean;
  isTeamMember: boolean;
  isWorkspaceMember: boolean;
  isPublic: boolean;
  teamRole?: TeamRole;
  workspaceRole?: WorkspaceRole;
}

// ── Permission Mappings ─────────────────────────────────────────────

/** Minimum workspace role required for each permission */
export const WORKSPACE_PERMISSION_MAP: Record<Permission, WorkspaceRole> = {
  view: "viewer",
  edit: "member",
  delete: "owner",
  assign: "member",
  manage_members: "admin",
  admin: "owner",
};

/** Minimum team role required for each permission */
export const TEAM_PERMISSION_MAP: Record<Permission, TeamRole> = {
  view: "member",
  edit: "member",
  delete: "owner",
  assign: "member",
  manage_members: "admin",
  admin: "owner",
};

// ── DB Context (passed to resolvers) ────────────────────────────────
export interface AccessDbContext {
  db: PrismaClient;
}

// ── Helper: check if role meets minimum ─────────────────────────────
export function hasMinimumWorkspaceRole(
  actual: WorkspaceRole,
  minimum: WorkspaceRole,
): boolean {
  return WORKSPACE_ROLE_HIERARCHY[actual] >= WORKSPACE_ROLE_HIERARCHY[minimum];
}

export function hasMinimumTeamRole(
  actual: TeamRole,
  minimum: TeamRole,
): boolean {
  return TEAM_ROLE_HIERARCHY[actual] >= TEAM_ROLE_HIERARCHY[minimum];
}
