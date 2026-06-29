import { sortByPriority } from "~/lib/actions/priority";

export interface ActionPartition<T> {
  overdue: T[];
  todays: T[];
  upcoming: T[];
  inbox: T[];
  completed: T[];
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
 * Pure, server-shared partition of a user's actions into the `/today` buckets —
 * the single source of truth for "what counts as today" (ADR-0034).
 *
 * Both the client hook `useActionPartition` and the `action.getTodaysActions`
 * tRPC procedure call this, so the page and Zoe's tool agree by construction.
 *
 * The "today" definition here is **scheduled-or-due** (the `/today` set), which
 * is deliberately wider than the due-only **Daily brief** (`generateBriefingData`):
 *   - `overdue`   — `scheduledStart` before today
 *   - `todays`    — `scheduledStart` today, OR no schedule and `dueDate` today
 *                   (a scheduled-today action with no due date still counts —
 *                   the "Pay Malte" shape)
 *   - `upcoming`  — `scheduledStart` after tomorrow
 *   - `inbox`     — no schedule, no due date, no project
 *   - `completed` — status COMPLETED
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

    if (scheduledDay && scheduledDay.getTime() < today.getTime()) {
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

  overdue.sort(sortByPriority);
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

  return { overdue, todays, upcoming, inbox, completed };
}
