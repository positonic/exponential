import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A person's Assistant, wherever they are (ADR-0072): one per person, so no
 * workspace argument. The one resolver chat, the gateways, settings and Agent
 * runs share once they move off the per-workspace lookup.
 *
 * Retired Assistants are never resolved. The partial unique index
 * "Assistant_active_per_user_key" allows at most one non-retired row per user;
 * until the migration that adds it has run, a user may still hold several, so
 * the most recently edited wins — deterministic, and the same row the
 * migration's survivor rule prefers when nothing else decides.
 *
 * Returns the whole row (persona included): callers that pass it on decide
 * what leaves the server.
 */
export async function resolveAssistantForUser(db: Db, userId: string) {
  return db.assistant.findFirst(activeAssistantQuery(userId));
}

/**
 * An Assistant that works in a workspace (ADR-0072): it belongs to no
 * workspace, so "in" means its principal is a member there. Never a retired
 * one. For workspace settings that point at an Assistant (the Workspace
 * Updates voice).
 */
export function assistantWorksInWorkspaceWhere(workspaceId: string) {
  return {
    retiredAt: null,
    externalAgent: {
      shadowUser: { workspaceMemberships: { some: { workspaceId } } },
    },
  } satisfies Prisma.AssistantWhereInput;
}

/**
 * The query behind {@link resolveAssistantForUser}, for a caller that needs to
 * add an `include` (the settings page's principal and keys) without restating
 * the rule.
 */
export function activeAssistantQuery(userId: string) {
  return {
    where: { createdById: userId, retiredAt: null },
    orderBy: { updatedAt: "desc" as const },
  };
}
