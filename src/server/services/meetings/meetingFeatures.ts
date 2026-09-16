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

type MeetingFeatureClient = Pick<PrismaClient, "meetingFeature">;

/**
 * Drop the feature links a meeting move strands: every link on `meetingIds`
 * whose feature isn't in `workspaceId` (all of them when it is null, since a
 * workspace-less meeting can't carry links). Call it wherever a meeting's
 * `workspaceId` changes. Returns the Prisma promise un-awaited so it can join
 * an array `$transaction`.
 */
export function dropStrandedMeetingFeatureLinks(
  db: MeetingFeatureClient,
  input: { meetingIds: string[]; workspaceId: string | null },
) {
  return db.meetingFeature.deleteMany({
    where: {
      transcriptionSessionId: { in: input.meetingIds },
      ...(input.workspaceId
        ? { feature: { product: { workspaceId: { not: input.workspaceId } } } }
        : {}),
    },
  });
}

/**
 * The feature-side twin: when features move to `workspaceId` (a Feature move,
 * or a whole Product moving workspace), drop their links to meetings that stay
 * behind. Pass exactly one of `featureIds` or `productId`.
 */
export function dropStrandedFeatureMeetingLinks(
  db: MeetingFeatureClient,
  input: { featureIds?: string[]; productId?: string; workspaceId: string },
) {
  return db.meetingFeature.deleteMany({
    where: {
      feature: input.productId
        ? { productId: input.productId }
        : { id: { in: input.featureIds ?? [] } },
      transcriptionSession: {
        OR: [{ workspaceId: null }, { workspaceId: { not: input.workspaceId } }],
      },
    },
  });
}
