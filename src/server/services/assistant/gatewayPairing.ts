import type { PrismaClient } from "@prisma/client";
import { buildWorkspaceAccessWhere } from "~/server/services/access/resolvers/workspaceResolver";
import { findPersonalWorkspaceId } from "./personalWorkspace";
import { resolveAssistantForUser } from "./resolveAssistant";

/**
 * What the Telegram and Matrix gateways' `/pair` body carries (Agent PRD D13):
 * the person's Assistant (ADR-0072: one per person, resolved with no
 * workspace) and a workspace for the paired chat's Mastra request context.
 *
 * The workspace used to be `Assistant.workspaceId`. The gateways type it as
 * optional, but it is load-bearing: the agent's knowledge tools throw "No
 * workspace in context" without it, so it is never null when the person has
 * any workspace. The person's default workspace — only while they can still
 * access it (removing a member leaves `defaultWorkspaceId` stale) — else their
 * Personal workspace (which onboarding guarantees), else any workspace they
 * belong to.
 */
export async function resolveGatewayPairing(
  db: PrismaClient,
  userId: string,
): Promise<{ assistant: { id: string; name: string } | null; workspaceId: string | null }> {
  const [assistant, workspaceId] = await Promise.all([
    resolveAssistantForUser(db, userId),
    resolvePairingWorkspace(db, userId),
  ]);
  return {
    assistant: assistant ? { id: assistant.id, name: assistant.name } : null,
    workspaceId,
  };
}

async function resolvePairingWorkspace(db: PrismaClient, userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { defaultWorkspaceId: true },
  });
  if (user?.defaultWorkspaceId) {
    const accessible = await db.workspace.findFirst({
      where: { id: user.defaultWorkspaceId, ...buildWorkspaceAccessWhere(userId) },
      select: { id: true },
    });
    if (accessible) return accessible.id;
  }

  const personalId = await findPersonalWorkspaceId(db, userId);
  if (personalId) return personalId;

  const membership = await db.workspaceUser.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}
