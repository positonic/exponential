import { useEffect, useState } from "react";
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
