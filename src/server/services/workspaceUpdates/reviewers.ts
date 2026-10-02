import type { PrismaClient } from "@prisma/client";

/**
 * Who reviews a workspace's updates: the configured reviewers who are still
 * members, else the workspace's owners and admins, else its owner. Never empty
 * for a live workspace, so a draft always reaches someone who can approve it.
 */
export async function resolveReviewerIds(
  db: PrismaClient,
  workspaceId: string,
  configuredIds: readonly string[],
): Promise<string[]> {
  if (configuredIds.length > 0) {
    const members = await db.workspaceUser.findMany({
      where: { workspaceId, userId: { in: [...configuredIds] } },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));
    const reviewers = configuredIds.filter((id) => memberIds.has(id));
    if (reviewers.length > 0) return reviewers;
  }

  const admins = await db.workspaceUser.findMany({
    where: { workspaceId, role: { in: ["owner", "admin"] } },
    select: { userId: true },
    orderBy: { joinedAt: "asc" },
  });
  if (admins.length > 0) return admins.map((a) => a.userId);

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  return workspace?.ownerId ? [workspace.ownerId] : [];
}

/**
 * May `userId` act on a workspace's drafts (approve / regenerate / skip)?
 * Reviewers can, and so can owners and admins.
 */
export async function canReviewUpdates(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const [config, membership] = await Promise.all([
    db.workspaceUpdateConfig.findUnique({
      where: { workspaceId },
      select: { reviewerIds: true },
    }),
    db.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { role: true },
    }),
  ]);
  if (!membership) return false;
  if (membership.role === "owner" || membership.role === "admin") return true;
  return config?.reviewerIds.includes(userId) ?? false;
}
