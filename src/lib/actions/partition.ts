import { comparePriorityRank, sortByPriority } from "~/lib/actions/priority";

export interface ActionPartition<T> {
  overdue: T[];
  todays: T[];
  upcoming: T[];
  inbox: T[];
  completed: T[];
  /** Subset of `completed` with `completedAt` within [today, tomorrow). */
  completedToday: T[];
}

export interface PartitionableAction {
  id: string;
  status: string;
  priority?: string | null;
  scheduledStart?: Date | string | null;
  dueDate?: Date | string | null;
  projectId?: string | null;
  completedAt?: Date | string | null;
}

export interface PartitionActionsOptions {
  today: Date;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(base: Date, n: number): Date {
  const out = new Date(base);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * The calendar day that makes (or would make) an action late: the
 * `scheduledStart` day when a schedule exists, else the `dueDate` day.
 * Null when the action has neither. Mirrors the overdue rule's
 * schedule-wins precedence so sort order and age labels agree.
 */
export function overdueAnchor(
  a: Pick<PartitionableAction, "scheduledStart" | "dueDate">,
): Date | null {
  if (a.scheduledStart) return startOfDay(new Date(a.scheduledStart));
  if (a.dueDate) return startOfDay(new Date(a.dueDate));
  return null;
}

/**
 * Pure, server-shared partition of a user's actions into the `/today` buckets —
 * the single source of truth for "what counts as today" (ADR-0034).
 *
 * Both the client hook `useActionPartition` and the `action.getTodaysActions`
 * tRPC procedure call this, so the page and Zoe's tool agree by construction.
 *
 * The "today" definition here is **scheduled-or-due** (the `/today` set), which
 * is deliberately wider than the due-only **Daily brief** (`generateBriefingData`):
 *   - `overdue`   — `scheduledStart` before today, OR no schedule and
 *                   `dueDate` before today (schedule wins: a past-due action
 *                   scheduled today/future is NOT overdue)
 *   - `todays`    — `scheduledStart` today, OR no schedule and `dueDate` today
 *                   (a scheduled-today action with no due date still counts —
 *                   the "Pay Malte" shape)
 *   - `upcoming`  — `scheduledStart` after tomorrow
 *   - `inbox`     — no schedule, no due date, no project
 *   - `completed` — status COMPLETED
 *   - `completedToday` — subset of `completed` finished within [today, tomorrow)
 *
 * Only `ACTIVE` (and `COMPLETED`) actions are bucketed; any other status is
 * dropped. The function is pure: it does not read the clock — callers pass
 * `today` explicitly so the result is deterministic and testable.
 */
export function partitionActions<T extends PartitionableAction>(
  actions: T[],
  options: PartitionActionsOptions,
): ActionPartition<T> {
  const today = startOfDay(options.today);
  const tomorrow = addDays(today, 1);

  const overdue: T[] = [];
  const todays: T[] = [];
  const upcoming: T[] = [];
  const inbox: T[] = [];
  const completed: T[] = [];

  for (const a of actions) {
    if (a.status === "COMPLETED") {
      completed.push(a);
      continue;
    }
    if (a.status !== "ACTIVE") continue;

    const scheduled = a.scheduledStart ? new Date(a.scheduledStart) : null;
    const scheduledDay = scheduled ? startOfDay(scheduled) : null;
    const due = a.dueDate ? new Date(a.dueDate) : null;
    const dueDay = due ? startOfDay(due) : null;

    const isOverdue =
      (scheduledDay !== null && scheduledDay.getTime() < today.getTime()) ||
      (scheduledDay === null &&
        dueDay !== null &&
        dueDay.getTime() < today.getTime());
    if (isOverdue) {
      overdue.push(a);
      continue;
    }

    if (
      scheduledDay &&
      scheduledDay.getTime() === today.getTime() &&
      scheduled &&
      scheduled < tomorrow
    ) {
      todays.push(a);
      continue;
    }

    if (!scheduled && dueDay && dueDay.getTime() === today.getTime()) {
      todays.push(a);
      continue;
    }

    if (scheduledDay && scheduledDay.getTime() > tomorrow.getTime()) {
      upcoming.push(a);
      continue;
    }

    if (!a.dueDate && !a.scheduledStart && !a.projectId) {
      inbox.push(a);
      continue;
    }
  }

  // Overdue: priority first, then oldest debt first, then id.
  overdue.sort((a, b) => {
    const rank = comparePriorityRank(a, b);
    if (rank !== 0) return rank;
    const aAnchor = overdueAnchor(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bAnchor = overdueAnchor(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aAnchor !== bAnchor) return aAnchor - bAnchor;
    return a.id.localeCompare(b.id);
  });
  todays.sort(sortByPriority);
  upcoming.sort(sortByPriority);
  inbox.sort(sortByPriority);

  completed.sort((a, b) => {
    const aAt = a.completedAt;
    const bAt = b.completedAt;
    if (!aAt && !bAt) return a.id.localeCompare(b.id);
    if (!aAt) return 1;
    if (!bAt) return -1;
    return new Date(bAt).getTime() - new Date(aAt).getTime();
  });

  const completedToday = completed.filter((a) => {
    if (!a.completedAt) return false;
    const t = new Date(a.completedAt).getTime();
    return t >= today.getTime() && t < tomorrow.getTime();
  });

  return { overdue, todays, upcoming, inbox, completed, completedToday };
}

export interface ActionDayGroup<T> {
  /** Local midnight of the group's day. */
  day: Date;
  actions: T[];
}

/**
 * The `/today?filter=upcoming` list: every `ACTIVE` action whose do-day
 * (`overdueAnchor` — schedule wins, else due) falls on tomorrow or later,
 * grouped by that day in date order, priority-sorted within each day.
 *
 * Uses the same day anchor as `partitionActions`, so the first group is exactly
 * `partitionActions(actions, { today: tomorrow }).todays` — the Tomorrow tab
 * and the top of the Upcoming tab can't disagree.
 */
export function groupUpcomingByDay<T extends PartitionableAction>(
  actions: T[],
  options: PartitionActionsOptions,
): ActionDayGroup<T>[] {
  const tomorrow = addDays(startOfDay(options.today), 1);
  const byDay = new Map<number, T[]>();

  for (const a of actions) {
    if (a.status !== "ACTIVE") continue;
    const anchor = overdueAnchor(a);
    if (!anchor || anchor.getTime() < tomorrow.getTime()) continue;
    const key = anchor.getTime();
    const bucket = byDay.get(key);
    if (bucket) bucket.push(a);
    else byDay.set(key, [a]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, group]) => ({ day: new Date(key), actions: group.sort(sortByPriority) }));
}
