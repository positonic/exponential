import type { Prisma } from "@prisma/client";

/**
 * "My actions": ones I created and nobody is assigned to, or ones assigned to
 * me. `action.getAll`, `action.getToday` and `action.getSidebarCounts` all
 * build on this, so the sidebar's counts can't drift from the lists they
 * summarise.
 */
export function myActionsOwnershipWhere(userId: string): Prisma.ActionWhereInput {
  return {
    OR: [
      // Created by me AND no assignees
      { createdById: userId, assignees: { none: {} } },
      // Assigned to me via ActionAssignee
      { assignees: { some: { userId } } },
    ],
  };
}

/**
 * Active actions of mine due today, by the server's local day — the set
 * `action.getToday` returns.
 */
export function myActionsDueTodayWhere(
  userId: string,
  now: Date,
  workspaceId?: string,
): Prisma.ActionWhereInput {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    ...myActionsOwnershipWhere(userId),
    dueDate: {
      gte: today,
      lt: tomorrow,
    },
    status: "ACTIVE",
    // Filter by workspace via the action's project
    ...(workspaceId ? { project: { workspaceId } } : {}),
  };
}

/**
 * The inbox the sidebar counts: my active actions with no project. The same
 * set as filtering `action.getAll()` (no input) by
 * `!projectId && status === "ACTIVE"`.
 */
export function myInboxActionsWhere(userId: string): Prisma.ActionWhereInput {
  return {
    AND: [myActionsOwnershipWhere(userId)],
    projectId: null,
    status: "ACTIVE",
  };
}
