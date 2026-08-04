/**
 * Assignability guards.
 *
 * Sibling to `workspaceRefs.ts`: same class of hole, different target. A write
 * that accepts a foreign key opens a *read* path, because the pointed-at row's
 * fields come back inside the pointing row's own `include`.
 *
 * For `assigneeId` the pointed-at row is a `User`, and the include returns
 * `name` and `email`. So without this guard an authenticated user can create a
 * ticket in their own product, set `assigneeId` to an arbitrary user CUID, read
 * the ticket back through `ticket.getById`, and harvest that user's email — a
 * user-enumeration / PII disclosure path that needs only a valid CUID.
 *
 * The rule, one line: **you may only assign someone who could already read the
 * thing you are assigning them to.** Assignment is not a capability grant — it
 * cannot reach further than the reader set, or it becomes a way to pull a
 * stranger's identity into a workspace they have nothing to do with.
 *
 * Two consequences worth stating, because both were open questions:
 *
 *  - **Workspace guests are not assignable to tickets.** A guest (project-only
 *    `ProjectMember`, no `WorkspaceUser` row) is refused by
 *    `getWorkspaceMembership`, which is the same resolver behind
 *    `assertWorkspaceMember` — the gate on every ticket read. A guest therefore
 *    cannot open the ticket at all, so assigning one is both useless and a
 *    leak. Excluding them keeps the assignable set a subset of the reader set.
 *  - **External-agent shadow users need no exception.** ADR-0049 gives each
 *    agent's shadow user ordinary `WorkspaceUser` rows, granted by the owner,
 *    so they pass through `getWorkspaceMembership` unchanged.
 *
 * Rejections are NOT_FOUND rather than FORBIDDEN so the error cannot be used as
 * an oracle confirming that a given CUID belongs to a real user somewhere.
 */

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { getWorkspaceMembership } from "./resolvers/workspaceResolver";

/**
 * Throw unless `assigneeId` may be assigned work inside `workspaceId`.
 *
 * A `null` or `undefined` assignee means "not being set" (or "being cleared")
 * and is skipped — unassigning is always allowed.
 *
 * Used by the ticket router, where the workspace is never ambiguous: a ticket's
 * workspace comes from its product. Actions, whose scope can be a project, a
 * team, or nothing at all, use `canAssignToUnscopedAction` below.
 */
export async function assertAssignableUser(
  db: PrismaClient,
  workspaceId: string,
  assigneeId: string | null | undefined,
): Promise<void> {
  if (!assigneeId) return;

  const membership = await getWorkspaceMembership(db, assigneeId, workspaceId);
  if (!membership) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Assignee not found in this workspace",
    });
  }
}

/**
 * May `candidateId` be assigned to an action that has neither a project nor a
 * team?
 *
 * `action.assign` validates candidates against the action's project or team,
 * but fell through to an unconditional `true` when the action had neither —
 * and then returned `assignees.user.email`, reopening the same leak.
 *
 * The replacement mirrors exactly what `getAssignableUsers` offers the picker
 * for such an action, so the server enforces what the UI already presents:
 * yourself (1), members of the action's workspace (2), and users who share a
 * team with you (3). Nothing wider.
 */
export async function canAssignToUnscopedAction(
  db: PrismaClient,
  callerId: string,
  workspaceId: string | null,
  candidateId: string,
): Promise<boolean> {
  // 1. Self-assignment is always legitimate and leaks nothing new.
  if (candidateId === callerId) return true;

  // 2. Members of the action's own workspace, when it has one.
  if (workspaceId) {
    const membership = await getWorkspaceMembership(db, candidateId, workspaceId);
    if (membership) return true;
  }

  // 3. Users who share a team with the caller — the picker's fallback for an
  //    action with no workspace context at all.
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
