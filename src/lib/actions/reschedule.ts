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
 * The fields a reschedule writes — the do-date *and* the deadline.
 *
 * `scheduledStart` has to move. `partitionActions` buckets an action by its
 * `scheduledStart` whenever one is set and only falls back to `dueDate` when it
 * is null, so writing the deadline alone leaves a past `scheduledStart` in
 * place and the action sits in the overdue pile exactly where it was. That
 * makes "Reschedule all overdue" a no-op against the very rows it targets.
 *
 * The original complaint behind this function was real, but it was about the
 * *value*, not the field: stamping the click's wall-clock instant drew phantom
 * hour-long blocks seconds apart on the agenda rail. `resolveQuickReschedule`
 * normalises to local midnight, which fixes that without breaking the move.
 *
 * Both Today surfaces route their reschedule handlers through here so the two
 * cannot drift.
 */
export function rescheduleUpdateFields(
  choice: RescheduleChoice,
): { scheduledStart: Date | null; dueDate: Date | null } {
  return {
    scheduledStart: choice.date ?? null,
    dueDate: choice.date ?? null,
  };
}
