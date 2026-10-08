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
 * My actions for today — the `/today` page's `todays` bucket as a WHERE
 * clause. Mirrors `partitionActions()` exactly (ADR-0034): scheduled today, or
 * unscheduled and due today (schedule wins, so a past-due action rescheduled
 * for today counts, and one due today but scheduled for another day does not).
 * The set `action.getToday` returns and the sidebar's Today badge counts.
 *
 * `startOfToday` is the caller's local midnight, passed in so the day is the
 * viewer's, not the server's. The day ends 24h later, so on a DST-change day
 * the window is an hour off at one end.
 *
 * `workspaceId` scopes like `action.getAll`: the action's own workspace or its
 * project's, so project-less actions (calendar blocks, quick adds) still count.
 */
export function myActionsTodayWhere(
  userId: string,
  startOfToday: Date,
  workspaceId?: string,
): Prisma.ActionWhereInput {
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const today = { gte: startOfToday, lt: startOfTomorrow };

  return {
    AND: [
      myActionsOwnershipWhere(userId),
      {
        OR: [
          { scheduledStart: today },
          { scheduledStart: null, dueDate: today },
        ],
      },
      ...(workspaceId
        ? [
            {
              OR: [
                { workspaceId },
                { project: { workspaceId } },
              ],
            },
          ]
        : []),
    ],
    status: "ACTIVE",
  };
}

/**
 * The unsorted actions the inbox's Actions tab counts: my active actions with
 * no project, no due date and no schedule — the `/today` partition's `inbox`
 * bucket (ADR-0034), which is what the tab lists. The same set as filtering
 * `action.getAll()` (no input) with `isInboxAction`.
 */
export function myInboxActionsWhere(userId: string): Prisma.ActionWhereInput {
  return {
    AND: [myActionsOwnershipWhere(userId)],
    projectId: null,
    dueDate: null,
    scheduledStart: null,
    status: "ACTIVE",
  };
}

/** Client-side twin of {@link myInboxActionsWhere}, for an already-loaded list. */
export function isInboxAction(a: {
  status: string;
  projectId: string | null;
  dueDate: Date | string | null;
  scheduledStart: Date | string | null;
}): boolean {
  return (
    a.status === "ACTIVE" &&
    !a.projectId &&
    !a.dueDate &&
    !a.scheduledStart
  );
}

/**
 * My overdue actions — the `/today` page's overdue bucket as a WHERE clause,
 * so it can be counted and capped in the database. Mirrors
 * `partitionActions()` exactly (ADR-0034): a schedule before today makes an
 * action overdue; with no schedule, a due date before today does (schedule
 * wins, so a past-due action rescheduled for today is not overdue).
 * `startOfToday` is the caller's local midnight, passed in so the day
 * boundary is the viewer's, not the server's.
 */
export function myOverdueActionsWhere(
  userId: string,
  startOfToday: Date,
): Prisma.ActionWhereInput {
  return {
    AND: [
      myActionsOwnershipWhere(userId),
      {
        OR: [
          { scheduledStart: { lt: startOfToday } },
          { scheduledStart: null, dueDate: { lt: startOfToday } },
        ],
      },
    ],
    status: "ACTIVE",
  };
}
