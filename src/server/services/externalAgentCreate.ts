import type { Prisma } from "@prisma/client";

/**
 * Create an External agent (ADR-0049): its shadow user, the agent row and a
 * `member` membership in each workspace. Runs inside the caller's transaction,
 * so a failure later in that transaction leaves no agent behind.
 *
 * Callers check the workspaces with `requireDelegableWorkspaces` first; this
 * function trusts them. Shared by `externalAgent.create` (Settings → Agents)
 * and `oauthConnection.approve` (the OAuth consent page).
 */
export async function createExternalAgent(
  tx: Prisma.TransactionClient,
  input: { ownerId: string; name: string; description?: string | null; workspaceIds: string[] },
) {
  const shadowUser = await tx.user.create({
    data: { name: input.name, isAgent: true },
  });
  const agent = await tx.externalAgent.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      ownerId: input.ownerId,
      shadowUserId: shadowUser.id,
    },
  });
  // One statement, not a loop of upserts: a "Select all" across many
  // workspaces must not run the interactive transaction into its timeout.
  // The shadow user is brand new, so there is nothing to upsert over.
  if (input.workspaceIds.length > 0) {
    await tx.workspaceUser.createMany({
      data: input.workspaceIds.map((workspaceId) => ({
        userId: shadowUser.id,
        workspaceId,
        // Agents only ever hold `member` (ADR-0049).
        role: "member",
      })),
    });
  }
  return agent;
}
