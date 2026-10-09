import type { Prisma } from "@prisma/client";

/**
 * An Assistant's principal (ADR-0067): an owned External agent whose shadow
 * user is a `member` of the Assistant's workspace. This is what makes an
 * Assistant an ordinary assignee under ADR-0049's delegation invariant, and
 * what V2's `exp_agent_` runner key hangs off.
 *
 * Shared by `assistant.create` and the backfill so the two cannot drift. Runs
 * inside the caller's transaction. The caller guarantees the owner is a
 * non-viewer member of `workspaceId` (the same precondition as
 * `externalAgent.grantWorkspaces`), or passes `grantMembership: false` to skip
 * the membership row — the invariant wins over completeness.
 */
export async function createAssistantPrincipal(
  tx: Prisma.TransactionClient,
  input: {
    name: string;
    ownerId: string;
    workspaceId: string;
    grantMembership?: boolean;
  },
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

  if (input.grantMembership ?? true) {
    await tx.workspaceUser.upsert({
      where: {
        userId_workspaceId: { userId: shadowUser.id, workspaceId: input.workspaceId },
      },
      // Agents only ever hold `member` (ADR-0049).
      create: { userId: shadowUser.id, workspaceId: input.workspaceId, role: "member" },
      update: { role: "member" },
    });
  }

  return { externalAgentId: agent.id, shadowUserId: shadowUser.id };
}
