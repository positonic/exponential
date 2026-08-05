import { addDays, nextSaturday } from "~/lib/actions/dates";

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
 * The returned date keeps `now`'s time-of-day. That is harmless because the
 * only field a reschedule writes is `dueDate`, which every consumer compares
 * at day granularity — see `rescheduleUpdateFields`.
 */
export function resolveQuickReschedule(id: string, now: Date): RescheduleChoice {
  switch (id) {
    case "today":
      return { id, label: "Today", date: new Date(now) };
    case "tomorrow":
      return { id, label: "Tomorrow", date: addDays(now, 1) };
    case "next-week":
      return { id, label: "Next week", date: addDays(now, 7) };
    case "weekend":
      return { id, label: "This weekend", date: nextSaturday(now) };
    default:
      return { id, label: "No date", date: null };
  }
}

/**
 * The fields a reschedule writes — the deadline, and nothing else.
 *
 * `scheduledStart` is deliberately absent. It means "a time-block the user
 * deliberately placed", and a quick option carries no such intent: it only
 * knows a day. Writing the click's wall-clock instant there is what filled the
 * agenda rail with phantom hour-long blocks seconds apart, and it is why both
 * Today surfaces route their reschedule handlers through this one function.
 *
 * An action that already holds a real `scheduledStart` keeps it. To clear every
 * date, use the defer path instead.
 */
export function rescheduleUpdateFields(
  choice: RescheduleChoice,
): { dueDate: Date | null } {
  return { dueDate: choice.date ?? null };
}
