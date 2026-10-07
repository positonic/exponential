/**
 * The date a project is working towards, and how many days remain until it.
 *
 * The project's own end date wins. Without one, the project borrows the
 * earliest date from the goals it is linked to: a goal's due date, else the
 * end of its OKR period ("Q4-2026" → Dec 31). Archived goals are ignored.
 */

import { differenceInCalendarDays, startOfDay } from "date-fns";
import { periodDateRange } from "~/plugins/okr/client/utils/okrDashboardUtils";

export interface TargetDateGoal {
  title: string;
  dueDate: Date | string | null;
  period: string | null;
  status?: string | null;
}

export type ProjectTargetDate =
  | { date: Date; source: "project" }
  | { date: Date; source: "goal"; goalTitle: string };

export function resolveProjectTargetDate(
  projectEndDate: Date | string | null | undefined,
  goals: readonly TargetDateGoal[],
): ProjectTargetDate | null {
  if (projectEndDate) return { date: new Date(projectEndDate), source: "project" };

  let best: ProjectTargetDate | null = null;
  for (const goal of goals) {
    if (goal.status === "archived") continue;
    const date = goal.dueDate
      ? new Date(goal.dueDate)
      : goal.period
        ? (periodDateRange(goal.period)?.end ?? null)
        : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    if (!best || date < best.date) best = { date, source: "goal", goalTitle: goal.title };
  }
  return best;
}

/** Calendar days from today to `target`; negative once it has passed. */
export function daysUntil(target: Date, now: Date = new Date()): number {
  return differenceInCalendarDays(startOfDay(target), startOfDay(now));
}

export function daysLeftLabel(days: number): string {
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days > 1) return `${days} days left`;
  if (days === -1) return "1 day overdue";
  return `${-days} days overdue`;
}
