import { format, isSameDay, isSameYear, subDays } from 'date-fns';

export interface DayGroup<T> {
  /** Stable key for the day, in the viewer's local time (`yyyy-MM-dd`). */
  key: string;
  /** "Today", "Yesterday", or the date written out. */
  label: string;
  items: T[];
}

/** Heading for a day: relative for the last two days, the date otherwise. */
export function dayLabel(day: Date, now: Date): string {
  if (isSameDay(day, now)) return 'Today';
  if (isSameDay(day, subDays(now, 1))) return 'Yesterday';
  return format(day, isSameYear(day, now) ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy');
}

/**
 * Split a list that is already in feed order into runs that share a local
 * calendar day. A new group starts whenever the day changes between two
 * consecutive items, so the feed's own order is never rearranged.
 */
export function groupByDay<T extends { createdAt: Date }>(
  items: T[],
  now: Date = new Date(),
): Array<DayGroup<T>> {
  const groups: Array<DayGroup<T>> = [];
  for (const item of items) {
    const current = groups[groups.length - 1];
    const key = format(item.createdAt, 'yyyy-MM-dd');
    if (current?.key === key) {
      current.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(item.createdAt, now), items: [item] });
    }
  }
  return groups;
}
