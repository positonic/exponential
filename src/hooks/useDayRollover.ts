import { useEffect, useMemo, useState } from "react";
import { addDays, startOfDay } from "date-fns";

export function useDayRollover(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const now = new Date();
    const nextMidnight = startOfDay(addDays(today, 1));
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    if (msUntilMidnight <= 0) {
      setToday(startOfDay(new Date()));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToday(startOfDay(new Date()));
    }, msUntilMidnight + 50);

    return () => window.clearTimeout(timeoutId);
  }, [today]);

  return today;
}

/**
 * Today as the viewer's local `[midnight, next midnight)` — for queries that
 * take the viewer's day (`action.getSidebarCounts`,
 * `action.getToday`). Both ends come from the browser's calendar,
 * so a DST-change day is its real 23 or 25 hours. Stable until midnight.
 */
export function useLocalDay(): { start: Date; end: Date } {
  const start = useDayRollover();
  return useMemo(() => ({ start, end: addDays(start, 1) }), [start]);
}
