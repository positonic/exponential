import type { Prisma } from "@prisma/client";
import { PAUSED_PROJECT_STATUSES } from "~/lib/actions/pausedProjects";

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
 * Not in a paused project: project-less, or in a project that is not On hold,
 * Completed or Cancelled ({@link PAUSED_PROJECT_STATUSES}). Every "on my
 * plate" set below carries it, so pausing a project takes its actions off
 * Today, the overdue pile and their counts. Nothing that lists a project's
 * own actions uses it.
 *
 * Spelled as an `OR` with `projectId: null`, not as `NOT { project: … }`:
 * Prisma emits a relation filter as `projectId IN (subquery)`, and
 * `NOT (NULL IN …)` is NULL in SQL, so the `NOT` form would drop every
 * project-less action. Client-side twin: `isInPausedProject`.
 */
export function notInPausedProjectWhere(): Prisma.ActionWhereInput {
  return {
    OR: [
      { projectId: null },
      { project: { status: { notIn: [...PAUSED_PROJECT_STATUSES] } } },
    ],
  };
}

/**
 * Scopes to one workspace the way `action.getAll` does: the action's own
 * workspace or its project's, so project-less actions (calendar blocks, quick
 * adds) still count.
 */
function inWorkspaceWhere(workspaceId: string): Prisma.ActionWhereInput {
  return {
    OR: [
      { workspaceId },
      { project: { workspaceId } },
    ],
  };
}

/**
 * Every action of mine that Today's actions partitions (ADR-0034): ACTIVE,
 * owned by me, not in a paused project, across all workspaces unless one is
 * given. `partitionActions()` buckets these into overdue / today / upcoming /
 * inbox. `action.getTodaysActions`, `action.getOverdueTriage`, the Daily
 * summary digest and the morning push all load this set, so they describe
 * the same pile as `/today`.
 */
export function myPlateActionsWhere(
  userId: string,
  workspaceId?: string,
): Prisma.ActionWhereInput {
  return {
    AND: [
      myActionsOwnershipWhere(userId),
      notInPausedProjectWhere(),
      ...(workspaceId ? [inWorkspaceWhere(workspaceId)] : []),
    ],
    status: "ACTIVE",
  };
}

/** A local calendar day as a half-open instant range: `[start, end)`. */
export interface LocalDay {
  start: Date;
  end: Date;
}

/**
 * Active actions of mine with a deadline today — `action.getToday`'s default
 * `"due"` basis. Deliberately due-only: the SDK documents `getToday` as that
 * slice and the CLI's `actions today --due-only` is built on it. For what is
 * on my plate today, use {@link myActionsTodayWhere}. Actions in a paused
 * project are left out.
 */
export function myActionsDueTodayWhere(
  userId: string,
  day: LocalDay,
  workspaceId?: string,
): Prisma.ActionWhereInput {
  return {
    ...myActionsOwnershipWhere(userId),
    AND: [notInPausedProjectWhere()],
    dueDate: {
      gte: day.start,
      lt: day.end,
    },
    status: "ACTIVE",
    // Filter by workspace via the action's project
    ...(workspaceId ? { project: { workspaceId } } : {}),
  };
}

/**
 * Today's actions — the `/today` page's `todays` bucket as a WHERE clause.
 * Mirrors `partitionActions()` exactly (ADR-0034): scheduled today, or
 * unscheduled and due today (schedule wins, so a past-due action rescheduled
 * for today counts, and one due today but scheduled for another day does not).
 * What the sidebar's Today badge counts and `action.getToday` lists on its
 * `"scheduled-or-due"` basis.
 *
 * `day` is the caller's local midnight to their next midnight, passed in so
 * the day is the viewer's, not the server's — both ends, because a DST-change
 * day is 23 or 25 hours long.
 *
 * `workspaceId` scopes like `action.getAll`: the action's own workspace or its
 * project's, so project-less actions (calendar blocks, quick adds) still count.
 * Actions in a paused project are left out, as everywhere on my plate.
 */
export function myActionsTodayWhere(
  userId: string,
  day: LocalDay,
  workspaceId?: string,
): Prisma.ActionWhereInput {
  const today = { gte: day.start, lt: day.end };

  return {
    AND: [
      myActionsOwnershipWhere(userId),
      {
        OR: [
          { scheduledStart: today },
          { scheduledStart: null, dueDate: today },
        ],
      },
      ...(workspaceId ? [inWorkspaceWhere(workspaceId)] : []),
      notInPausedProjectWhere(),
    ],
    status: "ACTIVE",
  };
}

/** The server's local today, for callers that don't send the viewer's. */
export function serverLocalDay(now: Date): LocalDay {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * The unsorted actions the inbox's Actions tab counts: my active actions with
 * no project, no due date and no schedule — the `/today` partition's `inbox`
 * bucket (ADR-0034), which is what the tab lists. The same set as filtering
 * `action.getAll()` (no input) with `isInboxAction`. Needs no paused-project
 * clause: an inbox action has no project to pause.
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
 * boundary is the viewer's, not the server's. Actions in a paused project are
 * left out: pausing a project is how you take its overdue debt off the pile.
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
      notInPausedProjectWhere(),
    ],
    status: "ACTIVE",
  };
}
