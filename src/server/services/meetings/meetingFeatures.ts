import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { getWorkspaceMembership } from "~/server/services/access";

/**
 * Guard for linking a Meeting to Features (`MeetingFeature`).
 *
 * Features are workspace-owned (via their Product), so a link needs the meeting
 * to have a workspace, the caller to be a member of it, and every feature to
 * belong to it. Edit access on the meeting itself is the caller's job — this
 * only checks the feature side. Duplicate ids are tolerated.
 */
export async function assertFeaturesLinkable(
  db: PrismaClient,
  userId: string,
  input: { workspaceId: string | null; featureIds: string[] },
): Promise<void> {
  const featureIds = Array.from(new Set(input.featureIds));
  if (featureIds.length === 0) return;

  if (!input.workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Assign the meeting to a workspace before linking features",
    });
  }

  const membership = await getWorkspaceMembership(db, userId, input.workspaceId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have access to this workspace's features",
    });
  }

  const inWorkspace = await db.feature.count({
    where: {
      id: { in: featureIds },
      product: { workspaceId: input.workspaceId },
    },
  });
  if (inWorkspace !== featureIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Features must belong to the meeting's workspace",
    });
  }
}
