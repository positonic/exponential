import { resolvePrincipal } from "~/server/services/access/principal";
import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import type { ActionWriteDeps } from "./types";

/**
 * Who a project-less Action is for when its creator is an agent and names
 * nobody: the agent's owner (decided 2026-11-15, ticket slim.lake).
 *
 * An agent writes as its shadow user (ADR-0049), so an Action it files with
 * no project and no assignee sits on nobody's Today or Inbox: those lists are
 * "created by me, or assigned to me", and no person is the creator. Assigning
 * the owner is how the work reaches the person the agent works for. The
 * writer stays the shadow user (`createdById`).
 *
 * Returns the owner's user id, or null when there is nobody to add:
 *
 * - the writer is a person, or an agent acting as a person (Zoe in chat, a
 *   gateway, voice), who is already the creator;
 * - the owner does not belong to the Action's workspace. Assignment never
 *   reaches further than the reader set, so an owner who could not open the
 *   Action is not attached to it. The create still succeeds, unassigned.
 *
 * "Is this an agent, and whose?" is `resolvePrincipal`'s answer, read from
 * the verified actor, never from a label the caller sends (`source`). Callers
 * ask only for an Action with no project and no named assignee: a project's
 * Actions are already seen by the project's people, and an agent that names
 * an assignee has said who the work is for.
 */
export async function resolveAgentOwnerAssignee(
  { db, actor }: ActionWriteDeps,
  workspaceId: string | null,
): Promise<string | null> {
  const principal = await resolvePrincipal({
    db,
    session: { user: { id: actor.userId } },
    tokenType: actor.tokenType,
  });
  if (principal.kind !== "agent") return null;

  if (workspaceId === null) return principal.ownerId;
  const membership = await getWorkspaceMembership(db, principal.ownerId, workspaceId);
  return membership ? principal.ownerId : null;
}
