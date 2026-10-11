import type { Prisma, PrismaClient } from "@prisma/client";
import { parseMentionIds } from "~/server/services/notifications/emit/mention";

type Db = PrismaClient | Prisma.TransactionClient;

export interface UnstartedAssistant {
  /** The Assistant's shadow user — what `action.assign` takes. */
  id: string;
  name: string | null;
}

/**
 * Assignment is the only thing that starts an Agent run (decided 2026-10-11):
 * mentioning an Assistant that is not assigned to the Action starts nothing.
 * This names those Assistants, so the comment's author can be told so and
 * offered the assignment — the honest-0 rule `agentRunsQueued` follows on
 * `action.assign`. An Assistant already assigned is left out: its run is
 * started (or resumed) by assignment, not by the mention.
 *
 * Only Assistants that belong to the Action's workspace (directly or through
 * a linked team) count, the same rule as mention notifications: crafted
 * `@[Name](id)` markup must not reveal another workspace's Assistant. An
 * Action with no workspace offers nothing.
 */
export async function findUnstartedAssistantMentions(
  db: Db,
  input: { actionId: string; content: string },
): Promise<UnstartedAssistant[]> {
  const ids = parseMentionIds(input.content);
  if (ids.length === 0) return [];

  const action = await db.action.findUnique({
    where: { id: input.actionId },
    select: { workspaceId: true, project: { select: { workspaceId: true } } },
  });
  const workspaceId = action?.workspaceId ?? action?.project?.workspaceId ?? null;
  if (!workspaceId) return [];

  const assistants = await db.user.findMany({
    where: {
      id: { in: ids },
      externalAgentShadow: { is: { assistant: { isNot: null } } },
      OR: [
        { workspaceMemberships: { some: { workspaceId } } },
        { teams: { some: { team: { workspaceId } } } },
      ],
    },
    select: { id: true, name: true },
  });
  if (assistants.length === 0) return [];

  const assigned = await db.actionAssignee.findMany({
    where: { actionId: input.actionId, userId: { in: assistants.map((a) => a.id) } },
    select: { userId: true },
  });
  const assignedIds = new Set(assigned.map((a) => a.userId));
  return assistants.filter((a) => !assignedIds.has(a.id));
}
