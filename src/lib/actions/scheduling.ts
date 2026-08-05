/**
 * Scheduling semantics shared by the Today agenda rail and the task list, so
 * the two can never disagree about what "scheduled" means.
 */

/** The Action fields that express a deliberate time-block. */
export interface TimeBlockFields {
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  duration?: number | null;
}

/**
 * Did the user actually choose a time for this action?
 *
 * A `scheduledStart` on its own does not mean they did: several code paths
 * stamp the current instant when a task lands on Today, which produces a start
 * with no end, no duration, and no time anyone picked. Those are the bulk of
 * the phantom blocks the agenda rail used to draw.
 *
 * A real time-block therefore needs a start *plus* a stated length — either a
 * positive `duration` or a `scheduledEnd`. The length's validity is not this
 * predicate's business; `resolveActionDurationMinutes` handles a `scheduledEnd`
 * that doesn't sit after the start.
 *
 * Narrows `scheduledStart` to non-null so callers can build a Date from it
 * without an assertion.
 */
export function hasUserChosenTime<T extends TimeBlockFields>(
  action: T,
): action is T & { scheduledStart: Date | string } {
  if (!action.scheduledStart) return false;
  if (action.duration != null && action.duration > 0) return true;
  return action.scheduledEnd != null;
}
