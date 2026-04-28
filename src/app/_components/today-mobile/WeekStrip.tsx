"use client";

import { addDays } from "~/lib/actions/dates";
import type { DoFilter } from "../DoPageContent";
import styles from "./MobileToday.module.css";

interface WeekStripProps {
  filter: DoFilter;
  onFilterChange: (f: DoFilter) => void;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function WeekStrip({ filter, onFilterChange }: WeekStripProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);

  // 2 days before today, today, then 4 days after — 7 cells total.
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 2));

  return (
    <div className={styles.strip}>
      {days.map((d) => {
        const isToday = d.toDateString() === today.toDateString();
        const isTomorrow = d.toDateString() === tomorrow.toDateString();
        const isPast = d.getTime() < today.getTime();

        const targetFilter: DoFilter = isToday
          ? "today"
          : isTomorrow
            ? "tomorrow"
            : "upcoming";

        const selected =
          (isToday && filter === "today") ||
          (isTomorrow && filter === "tomorrow") ||
          (!isToday && !isTomorrow && !isPast && filter === "upcoming");

        const classes = [
          styles.day,
          selected ? styles.selected : "",
          isPast ? styles.past : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            type="button"
            key={d.toISOString()}
            className={classes}
            onClick={() => {
              if (isPast) return;
              onFilterChange(targetFilter);
            }}
            disabled={isPast}
            aria-pressed={selected}
          >
            <span className={styles.dow}>{DOW[d.getDay()]}</span>
            <span className={styles.date}>{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}
