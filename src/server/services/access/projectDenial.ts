/**
 * The FORBIDDEN a caller gets when a project refuses them — worded so the
 * person reading it can act on it.
 *
 * "Access denied" told an agent's owner nothing (ticket alpha.shark, ticket 819):
 * not which account was refused, not what it lacked, not who could fix it. An
 * agent's refusal reaches a person only as text in a terminal or a chat, so the
 * text has to carry the whole story: the account (name and id, and its owner
 * when it is an agent), the project, the missing access, and the lever —
 * the project's Members tab for a restricted project, the workspace for an
 * outsider.
 *
 * Error path only: the lookups here never run on a granted request.
 */
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { getProjectAccess } from "./resolvers/projectResolver";
import type { ProjectAccess } from "./types";

/** What the caller was trying to do, as the message's verb phrase. */
export type ProjectDeniedAction =
  | "view this project"
  | "edit this project"
  | "read this page"
  | "edit this page"
  | "add a page to this project";

/**
 * Build the FORBIDDEN for `userId` being refused `action` on `projectId`.
 * Pass `access` when the caller already resolved it; otherwise it is resolved
 * here. Returns the error for the caller to throw.
 */
export async function projectAccessDeniedError(
  db: PrismaClient,
  userId: string,
  projectId: string,
  action: ProjectDeniedAction,
  access?: ProjectAccess,
): Promise<TRPCError> {
  const [project, user, agent, resolved] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { name: true, isRestricted: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, isAgent: true },
    }),
    db.externalAgent.findUnique({
      where: { shadowUserId: userId },
      select: { ownerId: true },
    }),
    access ? Promise.resolve(access) : getProjectAccess(db, userId, projectId),
  ]);
  const owner = agent
    ? await db.user.findUnique({
        where: { id: agent.ownerId },
        select: { name: true },
      })
    : null;

  const projectName = project?.name ?? "this project";
  const shortWho = user?.name ?? "This account";
  const ownerNote = agent
    ? `, an agent owned by ${owner?.name ?? "another member"}`
    : "";
  const who = `${shortWho} (${userId}${ownerNote})`;

  let why: string;
  if (!resolved.isWorkspaceMember && !resolved.isTeamMember) {
    why = `${shortWho} is not a member of the workspace that owns "${projectName}".`;
    why += agent
      ? " The agent's owner can add that workspace under Settings → Agents."
      : " A workspace admin can invite them first.";
  } else if (resolved.isRestricted && !resolved.isMember) {
    why =
      `"${projectName}" is a restricted project and ${shortWho} is not one of its members. ` +
      `A project admin can add ${shortWho} under the project's Members tab.`;
  } else {
    why = `${shortWho} has view-only access to "${projectName}".`;
  }

  return new TRPCError({
    code: "FORBIDDEN",
    message: `Access denied: ${who} can't ${action}. ${why}`,
  });
}
