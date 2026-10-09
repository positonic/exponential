import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import {
  getWorkspaceMembership,
  canEditWorkspaceContent,
} from "~/server/services/access/resolvers/workspaceResolver";

/**
 * Guard a caller-supplied `workspaceId` on a write.
 *
 * `workspaceId` arrives as free-form input, so membership is never implied by
 * having reached the mutation: without this check any authenticated user
 * could inject rows into an arbitrary workspace's task list by guessing its
 * CUID.
 *
 * Membership alone isn't sufficient either — `viewer` is a read-only role —
 * so this asserts `canEditWorkspaceContent` (member and above). Project-only
 * members ("guests") have no WorkspaceUser row and are refused here by
 * design; their writes are authorised through the project path instead,
 * which is why `createAction` skips this check for a workspace derived from
 * the project.
 */
export async function assertCanWriteToWorkspace(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!canEditWorkspaceContent(membership?.role ?? null)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to add actions to this workspace",
    });
  }
}
