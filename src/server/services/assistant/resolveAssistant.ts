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
  return db.assistant.findFirst({
    where: { createdById: userId, retiredAt: null },
    orderBy: { updatedAt: "desc" },
  });
}
