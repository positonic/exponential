import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { canDelegateFromRole } from "~/lib/agentDelegation";
import { memberGrant } from "~/server/services/externalAgentAccess";
import { findPersonalWorkspaceId } from "./personalWorkspace";
import { createAssistantPrincipal } from "./principal";
import { resolveAssistantForUser } from "./resolveAssistant";

/** The name a new Assistant starts with until its person renames it (ADR-0072). */
export const DEFAULT_ASSISTANT_NAME = "Zoe";

export interface AssistantDefaults {
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
 * A new Assistant is a `member` of its person's Personal workspace from the
 * start (Agent PRD V2) — the one workspace it joins without being added —
 * through the same grant as every other agent membership (D6), and only where
 * the person holds a delegating role there (ADR-0049). Every other workspace
 * it joins only when they add it.
 *
 * Idempotent. Returns the existing non-retired Assistant untouched (`created:
 * false`) — `defaults` apply only to a new one. Otherwise writes the principal
 * (shadow user → External agent), its Personal membership and the Assistant in
 * one transaction, so a half-made Assistant cannot exist. Two concurrent first
 * needs race on the partial unique index "Assistant_active_per_user_key"; the
 * loser's P2002 resolves to the winner's row.
 */
export async function ensureAssistantForUser(
  db: PrismaClient,
  userId: string,
  defaults: AssistantDefaults = {},
): Promise<{ assistant: Prisma.AssistantGetPayload<object>; created: boolean }> {
  const existing = await resolveAssistantForUser(db, userId);
  if (existing) return { assistant: existing, created: false };

  const personalWorkspaceId = await findPersonalWorkspaceId(db, userId);
  if (!personalWorkspaceId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your Personal workspace isn't set up yet. Open any workspace, then try again.",
    });
  }
  // The allowlist is the rule, not the assumption: a person is always the
  // owner of their own Personal workspace, but the grant is checked anyway.
  const personalMembership = await db.workspaceUser.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: personalWorkspaceId } },
    select: { role: true },
  });

  const name = defaults.name ?? DEFAULT_ASSISTANT_NAME;
  try {
    const assistant = await db.$transaction(async (tx) => {
      const { externalAgentId, shadowUserId } = await createAssistantPrincipal(tx, {
        name,
        ownerId: userId,
      });
      if (canDelegateFromRole(personalMembership?.role)) {
        await memberGrant(tx, shadowUserId, personalWorkspaceId);
      }
      return tx.assistant.create({
        data: {
          name,
          emoji: defaults.emoji ?? null,
          personality: defaults.personality ?? "",
          instructions: defaults.instructions ?? null,
          userContext: defaults.userContext ?? null,
          createdById: userId,
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
