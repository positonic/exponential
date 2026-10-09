import type { PrismaClient } from "@prisma/client";

/**
 * The shared Matrix gateway Integration (ADR-0043).
 *
 * It is a single *system* row: no user, no team, no workspace. Workspace-registered
 * Matrix servers are Integration rows too, and they also have `userId: null` — so a
 * lookup that constrains only on `userId` can return a workspace's homeserver instead
 * of the system row, silently rehoming every paired user's DM mapping and breaking
 * Matrix notifications for everyone.
 *
 * Every lookup of the shared gateway integration goes through this predicate, so the
 * `workspaceId: null` half of the constraint cannot be forgotten at a new call site.
 * It is the load-bearing half: it holds even if a workspace-scoped row is ever created
 * with the `matrix` provider rather than `matrix-server`.
 */
export const SHARED_MATRIX_INTEGRATION_WHERE = {
  provider: "matrix",
  status: "ACTIVE",
  userId: null,
  workspaceId: null,
} as const;

/** Has this user paired a Matrix account with the shared gateway (a DM can reach them)? */
export async function hasPairedMatrix(
  db: Pick<PrismaClient, "integration" | "integrationUserMapping">,
  userId: string,
): Promise<boolean> {
  const integration = await db.integration.findFirst({
    where: SHARED_MATRIX_INTEGRATION_WHERE,
    select: { id: true },
  });
  if (!integration) return false;
  const mapping = await db.integrationUserMapping.findFirst({
    where: { userId, integrationId: integration.id },
    select: { id: true },
  });
  return !!mapping;
}
