/**
 * The Shutdown recap: a weekday end-of-day message to one person, built from
 * the shutdown routine's own section queries (one loader, two renderings —
 * the same contract the Daily summary has with the daily brief).
 */

/** Something finished today, with what it rolls up to when we know. */
export interface RecapDoneItem {
  actionId: string;
  title: string;
  /** Absolute URL to the action. */
  url: string | null;
  projectName: string | null;
  goalTitle: string | null;
  keyResultTitle: string | null;
}

/**
 * An action the reader can act on by replying with its number. Numbers run
 * across "Left undone" and "Tomorrow" in one sequence, so "5" never means
 * two things in the same message.
 */
export interface RecapNumberedAction {
  n: number;
  actionId: string;
  title: string;
  url: string | null;
  /** "overdue · due 2 Oct", "scheduled", "due" — the section's own detail line. */
  detail: string | null;
}

export interface ShutdownRecap {
  firstName: string;
  /** "Thursday 8 October", in the reader's zone. */
  dayLabel: string;
  /** `yyyy-MM-dd` of the recapped day, in the reader's zone. */
  dayKey: string;
  timezone: string;
  done: RecapDoneItem[];
  /** "Commented on ticket: …" lines, grouped and capped by the section. */
  moved: string[];
  /** "5h 10m of attention · plus 1h of agent runs", product lines, nudges. */
  time: string[];
  leftUndone: RecapNumberedAction[];
  /** Overdue actions past the section's cap, shown as a count. */
  moreOverdue: number;
  /** Tomorrow's calendar, "09:30 Standup". */
  tomorrowMeetings: string[];
  /** What tomorrow's `/today` will hold, numbered after `leftUndone`. */
  tomorrowActions: RecapNumberedAction[];
  /** Absolute URL of `/today`, for the "more overdue" line. */
  todayUrl: string;
}
