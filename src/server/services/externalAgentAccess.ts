import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

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

  const result = await db.workspaceUser.deleteMany({
    where: {
      workspaceId,
      userId: { in: agents.map((a) => a.shadowUserId) },
    },
  });
  return result.count;
}

/**
 * Owner's role changed in a workspace. Agents always hold role `member`; a
 * demotion to `viewer` means the owner can no longer delegate member-level
 * access, so their agents' memberships are removed (there is no viewer tier
 * for agents — see ADR-0049). Promotions and admin↔member moves keep the
 * delegation valid and are no-ops.
 */
export async function cascadeOwnerRoleChanged(
  db: Db,
  ownerId: string,
  workspaceId: string,
  newRole: string,
): Promise<number> {
  if (newRole !== "viewer") return 0;
  return cascadeOwnerRemovedFromWorkspace(db, ownerId, workspaceId);
}
