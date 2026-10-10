import { addDays, nextSaturday, startOfLocalDay } from "~/lib/actions/dates";

/** A date the user picked from the reschedule popover. `null` means "no date". */
export interface RescheduleChoice {
  id: string;
  label: string;
  date: Date | null;
}

export const QUICK_RESCHEDULE_OPTIONS = [
  { id: "today", label: "Today", kbd: "T" },
  { id: "tomorrow", label: "Tomorrow", kbd: "O" },
  { id: "next-week", label: "Next week", kbd: "N" },
  { id: "weekend", label: "This weekend", kbd: "W" },
  { id: "no-date", label: "No date", kbd: "X" },
] as const;

/**
 * Resolve a quick option to a concrete date. `now` is passed in rather than
 * read from the clock so this stays pure and testable.
 *
 * Every option is normalised to local midnight. A quick option names a *day*
 * ("Tomorrow"), never a time, and the click's wall-clock instant is what filled
 * the agenda rail with phantom hour-long blocks seconds apart when it reached
 * `scheduledStart`. Normalising here rather than server-side keeps the day
 * boundary in the viewer's timezone — see `startOfLocalDay`.
 */
export function resolveQuickReschedule(id: string, now: Date): RescheduleChoice {
  switch (id) {
    case "today":
      return { id, label: "Today", date: startOfLocalDay(now) };
    case "tomorrow":
      return { id, label: "Tomorrow", date: startOfLocalDay(addDays(now, 1)) };
    case "next-week":
      return { id, label: "Next week", date: startOfLocalDay(addDays(now, 7)) };
    case "weekend":
      return { id, label: "This weekend", date: startOfLocalDay(nextSaturday(now)) };
    default:
      return { id, label: "No date", date: null };
  }
}

/**
 * The fields a single-action reschedule writes. Mirrors `action.bulkReschedule`
 * so the per-row popover and the bulk paths cannot drift.
 *
 * `scheduledStart` always moves. `partitionActions` buckets an action by its
 * `scheduledStart` whenever one is set and only falls back to `dueDate` when it
 * is null, so writing the deadline alone leaves a past `scheduledStart` in
 * place and the action sits in the overdue pile exactly where it was.
 *
 * `dueDate` is a real deadline, not a second copy of the do-date. It is pushed
 * forward only when it would otherwise fall before the new do-date, and left
 * alone otherwise — a Friday deadline survives a move to "Tomorrow", and an
 * action with no deadline is not given one. When it is left alone the field is
 * omitted rather than echoed back, so a stale cached value can't overwrite it.
 *
 * "No date" (`choice.date === null`) clears both.
 *
 * The value is local midnight (see `resolveQuickReschedule`): a wall-clock
 * instant here drew phantom hour-long blocks seconds apart on the agenda rail.
 */
export function rescheduleUpdateFields(
  choice: RescheduleChoice,
  currentDueDate: Date | null | undefined,
): { scheduledStart: Date | null; dueDate?: Date | null } {
  const date = choice.date;
  if (date === null) return { scheduledStart: null, dueDate: null };
  if (currentDueDate && currentDueDate < date) {
    return { scheduledStart: date, dueDate: date };
  }
  return { scheduledStart: date };
}
