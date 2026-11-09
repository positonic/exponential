import type { PrismaClient, Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import {
  canEditProject,
  getProjectAccess,
  hasProjectAccess,
} from "./access/resolvers/projectResolver";
import { getWorkspaceMembership } from "./access/resolvers/workspaceResolver";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Agents losing a workspace also lose every direct project membership in it.
 * A `ProjectMember` row grants project access on its own, so without this the
 * grants `assertAgentProjectMembership` admitted would outlive the workspace
 * delegation that authorised them. Returns the number of rows removed.
 */
export async function revokeAgentProjectMembershipsInWorkspace(
  db: Db,
  shadowUserIds: string[],
  workspaceId: string,
): Promise<number> {
  if (shadowUserIds.length === 0) return 0;
  const result = await db.projectMember.deleteMany({
    where: {
      userId: { in: shadowUserIds },
      project: { workspaceId },
    },
  });
  return result.count;
}

/**
 * Delegation invariant (ADR-0049): an External agent's workspace access never
 * exceeds or outlives its owner's. Enforced structurally — the workspace
 * membership mutation paths call these hooks, so the agent's `WorkspaceUser`
 * rows stay ordinary and every existing SQL access path works unchanged.
 */

/**
 * Owner removed from a workspace → their agents' shadow users lose their
 * membership there too. Returns the number of agent memberships removed.
 */
export async function cascadeOwnerRemovedFromWorkspace(
  db: Db,
  ownerId: string,
  workspaceId: string,
): Promise<number> {
  const agents = await db.externalAgent.findMany({
    where: { ownerId },
    select: { shadowUserId: true },
  });
  if (agents.length === 0) return 0;

  const shadowUserIds = agents.map((a) => a.shadowUserId);
  const result = await db.workspaceUser.deleteMany({
    where: {
      workspaceId,
      userId: { in: shadowUserIds },
    },
  });
  await revokeAgentProjectMembershipsInWorkspace(db, shadowUserIds, workspaceId);
  return result.count;
}

/**
 * Owner's role changed in a workspace. Agents always hold role `member`; a
 * demotion to `viewer` means the owner can no longer delegate member-level
 * access, so their agents' memberships are removed (there is no viewer tier
 * for agents — see ADR-0049). Promotions and admin↔member moves keep the
 * delegation valid and are no-ops.
 */
/**
 * Owner removed from a project → their agents' shadow users leave the project
 * too. The project-level half of the invariant: a restricted project an agent
 * was let into (see {@link assertAgentProjectMembership}) stays reachable only
 * while its owner holds it. Returns the number of agent memberships removed.
 */
export async function cascadeOwnerRemovedFromProject(
  db: Db,
  ownerId: string,
  projectId: string,
): Promise<number> {
  const agents = await db.externalAgent.findMany({
    where: { ownerId },
    select: { shadowUserId: true },
  });
  if (agents.length === 0) return 0;

  const result = await db.projectMember.deleteMany({
    where: {
      projectId,
      userId: { in: agents.map((a) => a.shadowUserId) },
    },
  });
  return result.count;
}

/**
 * Owner's project role changed → their agents' roles in that project are
 * clamped to it. Agents hold `editor` or `viewer`; an owner dropped to
 * `viewer` can no longer delegate editing, so their agents become viewers.
 * Promotions and editor↔admin moves are no-ops. Returns the rows changed.
 */
export async function cascadeOwnerProjectRoleChanged(
  db: Db,
  ownerId: string,
  projectId: string,
  newRole: string,
): Promise<number> {
  if (newRole !== "viewer") return 0;
  const agents = await db.externalAgent.findMany({
    where: { ownerId },
    select: { shadowUserId: true },
  });
  if (agents.length === 0) return 0;
  const result = await db.projectMember.updateMany({
    where: {
      projectId,
      userId: { in: agents.map((a) => a.shadowUserId) },
      role: { not: "viewer" },
    },
    data: { role: "viewer" },
  });
  return result.count;
}

/**
 * Grant-time guard for adding an External agent's shadow user to a project
 * (ticket alpha.shark, ticket 819: this is how an agent gets into a restricted
 * project). Throws unless all of these hold:
 *
 * - the shadow user belongs to an External agent;
 * - it is already a member of the project's workspace — workspaces are
 *   delegated by the owner from Settings → Agents, never implied by a project;
 * - its owner can see the project — an agent's access never exceeds its
 *   owner's (ADR-0049), so a project admin can't let in someone else's agent
 *   around that person;
 * - the role is `editor` or `viewer` — agents never manage members.
 */
export async function assertAgentProjectMembership(
  db: PrismaClient,
  shadowUserId: string,
  projectId: string,
  role: string,
): Promise<void> {
  if (role === "admin") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An agent can be a project editor or viewer, not an admin",
    });
  }
  const [agent, project] = await Promise.all([
    db.externalAgent.findUnique({
      where: { shadowUserId },
      select: { name: true, ownerId: true },
    }),
    db.project.findUnique({
      where: { id: projectId },
      select: { name: true, workspaceId: true },
    }),
  ]);
  if (!agent) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }

  const [ownerAccess, owner, workspaceMembership] = await Promise.all([
    getProjectAccess(db, agent.ownerId, projectId),
    db.user.findUnique({ where: { id: agent.ownerId }, select: { name: true } }),
    project.workspaceId
      ? getWorkspaceMembership(db, shadowUserId, project.workspaceId)
      : Promise.resolve(null),
  ]);
  if (project.workspaceId && !workspaceMembership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        `${agent.name} is not a member of this project's workspace yet. ` +
        `Its owner (${owner?.name ?? "the agent's owner"}) can add the workspace under Settings → Agents first.`,
    });
  }
  if (!hasProjectAccess(ownerAccess)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        `${agent.name} can't be given "${project.name}": its owner ` +
        `(${owner?.name ?? "another member"}) has no access to this project, and an agent's access never exceeds its owner's. ` +
        `Add the owner first.`,
    });
  }
  // The ceiling is the owner's actual capability, not just their presence: an
  // owner who can only view the project cannot delegate editing.
  if (role === "editor" && !canEditProject(ownerAccess)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        `${agent.name} can't edit "${project.name}": its owner ` +
        `(${owner?.name ?? "another member"}) can only view this project, and an agent's access never exceeds its owner's. ` +
        `Add the agent as a viewer, or make the owner an editor first.`,
    });
  }
}

export async function cascadeOwnerRoleChanged(
  db: Db,
  ownerId: string,
  workspaceId: string,
  newRole: string,
): Promise<number> {
  if (newRole !== "viewer") return 0;
  return cascadeOwnerRemovedFromWorkspace(db, ownerId, workspaceId);
}
