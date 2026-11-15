import { Prisma, type PrismaClient } from "@prisma/client";
import { createAssistantPrincipal } from "./principal";
import { resolveAssistantForUser } from "./resolveAssistant";

/** The name a new Assistant starts with until its person renames it (ADR-0072). */
export const DEFAULT_ASSISTANT_NAME = "Zoe";

export interface AssistantDefaults {
  /**
   * The workspace the new Assistant's row and first membership belong to. The
   * column goes in V1b; until then a row needs one. The caller guarantees the
   * person is a non-viewer member there (the delegation invariant), or passes
   * `grantMembership: false`.
   */
  workspaceId: string;
  grantMembership?: boolean;
  name?: string;
  emoji?: string | null;
  personality?: string;
  instructions?: string | null;
  userContext?: string | null;
}

/**
 * A person's Assistant, created on first need (ADR-0072): the one entry point
 * that may create an Assistant, called the first time its person personalises
 * it, adds it to a workspace or turns on delegation. Until then a person has no
 * Assistant and no principal, and chat is "Zoe" acting as them.
 *
 * Idempotent. Returns the existing non-retired Assistant untouched (`created:
 * false`) — `defaults` apply only to a new one. Otherwise writes the principal
 * (shadow user → External agent → membership) and the Assistant in one
 * transaction, so a half-made Assistant cannot exist. Two concurrent first
 * needs race on the partial unique index "Assistant_active_per_user_key"; the
 * loser's P2002 resolves to the winner's row.
 */
export async function ensureAssistantForUser(
  db: PrismaClient,
  userId: string,
  defaults: AssistantDefaults,
): Promise<{ assistant: Prisma.AssistantGetPayload<object>; created: boolean }> {
  const existing = await resolveAssistantForUser(db, userId);
  if (existing) return { assistant: existing, created: false };

  const name = defaults.name ?? DEFAULT_ASSISTANT_NAME;
  try {
    const assistant = await db.$transaction(async (tx) => {
      const { externalAgentId } = await createAssistantPrincipal(tx, {
        name,
        ownerId: userId,
        workspaceId: defaults.workspaceId,
        grantMembership: defaults.grantMembership,
      });
      return tx.assistant.create({
        data: {
          name,
          emoji: defaults.emoji ?? null,
          personality: defaults.personality ?? "",
          instructions: defaults.instructions ?? null,
          userContext: defaults.userContext ?? null,
          workspaceId: defaults.workspaceId,
          createdById: userId,
          // A person's only Assistant is their default; the per-workspace
          // readers that still key on it go in V1b.
          isDefault: true,
          externalAgentId,
        },
      });
    });
    return { assistant, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await resolveAssistantForUser(db, userId);
      if (winner) return { assistant: winner, created: false };
    }
    throw error;
  }
}
