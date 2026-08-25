import { IconClock, IconClockOff } from "@tabler/icons-react";
import { formatClockTime } from "~/lib/actions/dates";
import { hasUserChosenTime, type TimeBlockFields } from "~/lib/actions/scheduling";

interface ScheduledIndicatorProps {
  action: TimeBlockFields;
  /** The host row's chip class — each Today surface has its own. */
  className?: string;
  /** Extra class applied only in the unscheduled state. */
  unscheduledClassName?: string;
  iconSize?: number;
}

/**
 * Marks a task row as holding a real time slot, or not.
 *
 * Deliberately the *same* `hasUserChosenTime` the agenda rail builds its blocks
 * from, so the two can never disagree: a row showing the scheduled marker is
 * exactly a row that draws a block on the rail.
 *
 * This replaces the bare clock-plus-time the rows used to render off
 * `scheduledStart`. That was incidental — the clock happened to vanish for
 * untimed tasks — where the distinction now reads as deliberate. The two states
 * differ by icon shape rather than colour, and each carries its own label, so
 * neither the marker nor its meaning depends on being able to see the hue.
 *
 * Scheduled rows keep the time as visible text; unscheduled rows are icon-only,
 * because "no time" is the common case and a worded badge on most rows would
 * compete with the due date, tag and reschedule control already there.
 */
export function ScheduledIndicator({
  action,
  className,
  unscheduledClassName,
  iconSize = 11,
}: ScheduledIndicatorProps) {
  const scheduled = hasUserChosenTime(action);

  if (!scheduled) {
    return (
      <span
        className={[className, unscheduledClassName].filter(Boolean).join(" ")}
        role="img"
        aria-label="Not scheduled"
        title="Not scheduled — no time set"
      >
        <IconClockOff size={iconSize} />
      </span>
    );
  }

  const start = new Date(action.scheduledStart);
  const time = formatClockTime(start);
  const minutes = action.duration;
  const label = minutes
    ? `Scheduled for ${time}, ${minutes} min`
    : `Scheduled for ${time}`;

  return (
    <span className={className} title={label}>
      <IconClock size={iconSize} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{time}</span>
    </span>
  );
}
