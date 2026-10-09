/**
 * Attachment containment: may these tags, assignees and sprint list be
 * attached to an Action in this scope?
 *
 * One implementation each, shared by `createAction` (attachments written in
 * the create transaction) and the procedures that edit an existing Action
 * (`tag.setActionTags`, `action.assign`, `list.addAction`), so the rule
 * cannot drift between "attach on create" and "attach later".
 *
 * Every attachment is a foreign key, and a foreign key is a read path: the
 * pointed-at row comes back inside the Action's own `include`. So a tag must
 * be visible in the Action's workspace, an assignee must already be able to
 * read the Action, and a sprint list must be one the actor belongs to.
 */
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import {
  getProjectAccess,
  hasProjectAccess,
} from "~/server/services/access/resolvers/projectResolver";
import { canAssignToUnscopedAction } from "~/server/services/access/assignability";

/**
 * Throw unless every tag in `tagIds` is available in `workspaceId`: global
 * (no workspace) or owned by that workspace. When the Action has no workspace
 * at all, containment is undefined, so fall back to the security requirement
 * itself: the actor must be a member of each tag's own workspace.
 *
 * BAD_REQUEST, matching `tag.setTicketTags`.
 */
export async function assertTagsInWorkspace(
  db: PrismaClient,
  userId: string,
  workspaceId: string | null,
  tagIds: string[],
): Promise<void> {
  const uniqueTagIds = [...new Set(tagIds)];
  if (uniqueTagIds.length === 0) return;

  const refuse = () => {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more tags are not available in this workspace",
    });
  };

  if (workspaceId) {
    const validTags = await db.tag.findMany({
      where: {
        id: { in: uniqueTagIds },
        OR: [{ workspaceId: null }, { workspaceId }],
      },
      select: { id: true },
    });
    if (validTags.length !== uniqueTagIds.length) refuse();
    return;
  }

  const tags = await db.tag.findMany({
    where: { id: { in: uniqueTagIds } },
    select: { id: true, workspaceId: true },
  });
  if (tags.length !== uniqueTagIds.length) refuse();

  const foreignWorkspaceIds = [
    ...new Set(tags.flatMap((tag) => (tag.workspaceId ? [tag.workspaceId] : []))),
  ];
  const memberships = await Promise.all(
    foreignWorkspaceIds.map((id) => getWorkspaceMembership(db, userId, id)),
  );
  if (memberships.some((membership) => !membership)) refuse();
}

/** The scope an assignee is checked against: the Action's project, team or workspace. */
export interface AssignmentScope {
  projectId: string | null;
  teamId: string | null;
  workspaceId: string | null;
}

/**
 * May `candidateId` be assigned to an Action in `scope`?
 *
 * - Project: anyone with project access. Unrestricted projects also keep the
 *   legacy ergonomics of a team shared with the assigning user.
 * - Team (no project): team members only.
 * - Neither: the picker's set for a context-less Action — yourself, members of
 *   the Action's workspace, users who share a team with you.
 */
export async function canAssignUserToAction(
  db: PrismaClient,
  callerId: string,
  scope: AssignmentScope,
  candidateId: string,
): Promise<boolean> {
  if (scope.projectId) {
    const candidateAccess = await getProjectAccess(db, candidateId, scope.projectId);
    if (hasProjectAccess(candidateAccess)) return true;
    if (candidateAccess.isRestricted) return false;
    const sharedTeam = await db.team.findFirst({
      where: {
        AND: [
          { members: { some: { userId: candidateId } } },
          { members: { some: { userId: callerId } } },
        ],
      },
      select: { id: true },
    });
    return sharedTeam !== null;
  }

  if (scope.teamId) {
    const membership = await db.teamUser.findUnique({
      where: { userId_teamId: { userId: candidateId, teamId: scope.teamId } },
      select: { id: true },
    });
    return membership !== null;
  }

  return canAssignToUnscopedAction(db, callerId, scope.workspaceId, candidateId);
}

/**
 * Throw unless every user in `candidateIds` may be assigned in `scope`.
 *
 * NOT_FOUND, and deliberately not naming the rejected user: the message must
 * not hand the caller a stranger's identity on exactly the path where they
 * were just told they have no relationship to them.
 */
export async function assertAssignableUsers(
  db: PrismaClient,
  callerId: string,
  scope: AssignmentScope,
  candidateIds: string[],
): Promise<void> {
  for (const candidateId of new Set(candidateIds)) {
    const canAssign = await canAssignUserToAction(db, callerId, scope, candidateId);
    if (!canAssign) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Assignee not found in this ${
          scope.projectId ? "project" : scope.teamId ? "team" : "workspace"
        }`,
      });
    }
  }
}

/**
 * Throw unless `listId` exists, `userId` is a member of its workspace
 * (directly or through a team, the same resolver as the write gate), and —
 * when the Action has a workspace — the list is in that same workspace.
 * Returns the list's id and workspace.
 */
export async function assertListMembership(
  db: PrismaClient,
  userId: string,
  listId: string,
  actionWorkspaceId: string | null,
): Promise<{ id: string; workspaceId: string }> {
  const list = await db.list.findUnique({
    where: { id: listId },
    select: { id: true, workspaceId: true },
  });
  if (!list) {
    throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
  }

  const membership = await getWorkspaceMembership(db, userId, list.workspaceId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be a member of this workspace",
    });
  }

  if (actionWorkspaceId && list.workspaceId !== actionWorkspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "List is not in this workspace",
    });
  }

  return list;
}
