import { useMemo } from "react";
import { sortByPriority } from "~/lib/actions/priority";

export interface ActionPartition<T> {
  overdue: T[];
  todays: T[];
  upcoming: T[];
  inbox: T[];
  completed: T[];
}

interface UseActionPartitionOptions {
  today: Date;
}

interface PartitionableAction {
  id: string;
  status: string;
  priority?: string | null;
  scheduledStart?: Date | string | null;
  dueDate?: Date | string | null;
  projectId?: string | null;
  completedAt?: Date | string | null;
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

export function useActionPartition<T extends PartitionableAction>(
  actions: T[],
  options: UseActionPartitionOptions,
): ActionPartition<T> {
  return useMemo(() => {
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
  }, [actions, options.today]);
}
