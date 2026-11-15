import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * An Assistant's principal (ADR-0067): an owned External agent whose shadow
 * user is a `member` of each workspace the Assistant works in. This is what
 * makes an Assistant an ordinary assignee under ADR-0049's delegation
 * invariant, and what V2's `exp_agent_` runner key hangs off.
 *
 * Called by `ensureAssistantForUser`, the one entry point that creates an
 * Assistant (ADR-0072). Runs inside the caller's transaction and writes no
 * membership: where the Assistant works is granted through the External-agent
 * grant path (`memberGrant`, Agent PRD D5/D6).
 */
export async function createAssistantPrincipal(
  tx: Prisma.TransactionClient,
  input: { name: string; ownerId: string },
): Promise<{ externalAgentId: string; shadowUserId: string }> {
  const shadowUser = await tx.user.create({
    data: { name: input.name, isAgent: true },
    select: { id: true },
  });

  const agent = await tx.externalAgent.create({
    data: {
      name: input.name,
      ownerId: input.ownerId,
      shadowUserId: shadowUser.id,
    },
    select: { id: true },
  });

  return { externalAgentId: agent.id, shadowUserId: shadowUser.id };
}

/**
 * Keep the principal's display name in step with the Assistant's: the picker,
 * the members list and every attributed write read the shadow user's name.
 */
export async function renameAssistantPrincipal(
  tx: Prisma.TransactionClient,
  externalAgentId: string,
  name: string,
): Promise<void> {
  const agent = await tx.externalAgent.update({
    where: { id: externalAgentId },
    data: { name },
    select: { shadowUserId: true },
  });
  await tx.user.update({ where: { id: agent.shadowUserId }, data: { name } });
}

/**
 * Delete an External agent: credentials and memberships always die with it;
 * the shadow user row goes only when nothing references it — if the agent
 * authored content (Action.createdById etc.), the restricted FKs block the
 * delete and the row is kept, inert (no keys, no memberships, no login) but
 * preserving historical attribution. An Assistant backed by the agent is
 * removed by the FK cascade (ADR-0067).
 *
 * Returns the shadow user's image URL when the row was removed, so the
 * caller can clean up blob storage once nothing can reach it.
 */
export async function deleteExternalAgentPrincipal(
  db: PrismaClient,
  agent: { id: string; shadowUserId: string; shadowUser: { image: string | null } },
): Promise<{ shadowUserRetained: boolean; orphanedImage: string | null }> {
  await db.$transaction([
    db.externalAgentKey.deleteMany({ where: { agentId: agent.id } }),
    db.workspaceUser.deleteMany({ where: { userId: agent.shadowUserId } }),
    db.externalAgent.delete({ where: { id: agent.id } }),
  ]);

  try {
    await db.user.delete({ where: { id: agent.shadowUserId } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014")
    ) {
      return { shadowUserRetained: true, orphanedImage: null };
    }
    throw error;
  }
  return { shadowUserRetained: false, orphanedImage: agent.shadowUser.image };
}
