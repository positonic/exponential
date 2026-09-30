import type { PrismaClient } from "@prisma/client";
import { buildWorkspaceAccessWhere } from "~/server/services/access/resolvers/workspaceResolver";

/**
 * Assistants are per user, per workspace, but a chat gateway (Telegram,
 * Matrix) pairs one external identity to one assistant. This picks that one
 * deterministically, so the gateways and /settings/assistant agree on it:
 *
 *  1. the user's default assistant in their default workspace, else
 *  2. their most recently edited default assistant in any workspace.
 *
 * Only workspaces the user can still access count: leaving a workspace
 * doesn't delete the assistant they made there.
 *
 * Returns identity fields only — never the persona text.
 */
export async function findGatewayAssistant(db: PrismaClient, userId: string) {
  const [user, defaults] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { defaultWorkspaceId: true },
    }),
    db.assistant.findMany({
      where: {
        createdById: userId,
        isDefault: true,
        workspace: buildWorkspaceAccessWhere(userId),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        workspace: { select: { name: true } },
      },
    }),
  ]);

  return (
    defaults.find((a) => a.workspaceId === user?.defaultWorkspaceId) ??
    defaults[0] ??
    null
  );
}
