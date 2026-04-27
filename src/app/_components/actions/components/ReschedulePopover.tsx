import { useState } from "react";
import { IconCalendar, IconChevronDown } from "@tabler/icons-react";
import { addDays, nextSaturday } from "~/lib/actions/dates";
import styles from "./ReschedulePopover.module.css";

export interface RescheduleChoice {
  id: string;
  label: string;
  date: Date | null;
}

interface ReschedulePopoverProps {
  onChoose: (choice: RescheduleChoice) => void;
}

const QUICK_RESCHEDULE = [
  { id: "today", label: "Today", kbd: "T" },
  { id: "tomorrow", label: "Tomorrow", kbd: "O" },
  { id: "next-week", label: "Next week", kbd: "N" },
  { id: "weekend", label: "This weekend", kbd: "W" },
  { id: "no-date", label: "No date", kbd: "X" },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function ReschedulePopover({ onChoose }: ReschedulePopoverProps) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [mode, setMode] = useState<"quick" | "cal">("quick");
  const today = new Date();

  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const firstDow = new Date(month.y, month.m, 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);

  const resolveQuick = (id: string): RescheduleChoice => {
    const base = new Date();
    switch (id) {
      case "today":
        return { id, label: "Today", date: base };
      case "tomorrow":
        return { id, label: "Tomorrow", date: addDays(base, 1) };
      case "next-week":
        return { id, label: "Next week", date: addDays(base, 7) };
      case "weekend":
        return { id, label: "This weekend", date: nextSaturday(base) };
      default:
        return { id, label: "No date", date: null };
    }
  };

  return (
    <div
      className={styles.popover}
      style={{ right: 0, top: 36 }}
      onClick={(e) => e.stopPropagation()}
    >
      {mode === "quick" && (
        <>
          <div className={styles.head}>Reschedule</div>
          <div className={styles.quick}>
            {QUICK_RESCHEDULE.map((q) => (
              <button
                key={q.id}
                type="button"
                className={styles.btn}
                onClick={() => onChoose(resolveQuick(q.id))}
              >
                <span>{q.label}</span>
                <span className={styles.kbd}>{q.kbd}</span>
              </button>
            ))}
          </div>
          <div className={styles.sep} />
          <button
            type="button"
            className={styles.btn}
            onClick={() => setMode("cal")}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconCalendar size={14} />
              Pick a date…
            </span>
          </button>
        </>
      )}
      {mode === "cal" && (
        <div className={styles.cal}>
          <div className={styles.calHead}>
            <button
              type="button"
              className={styles.calNav}
              onClick={() =>
                setMonth((m) =>
                  m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 },
                )
              }
              aria-label="Previous month"
            >
              <IconChevronDown size={12} style={{ transform: "rotate(90deg)" }} />
            </button>
            <div className={styles.calTitle}>
              {MONTHS[month.m]} {month.y}
            </div>
            <button
              type="button"
              className={styles.calNav}
              onClick={() =>
                setMonth((m) =>
                  m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 },
                )
              }
              aria-label="Next month"
            >
              <IconChevronDown size={12} style={{ transform: "rotate(-90deg)" }} />
            </button>
          </div>
          <div className={styles.calGrid}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className={styles.calDow}>
                {d}
              </div>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  className={
                    d === today.getDate() &&
                    month.m === today.getMonth() &&
                    month.y === today.getFullYear()
                      ? `${styles.calDay} ${styles.calDayToday}`
                      : styles.calDay
                  }
                  onClick={() =>
                    onChoose({
                      id: "custom",
                      label: `${MONTHS[month.m]!.slice(0, 3)} ${d}`,
                      date: new Date(month.y, month.m, d),
                    })
                  }
                >
                  {d}
                </button>
              ),
            )}
          </div>
          <div className={styles.sep} />
          <button
            type="button"
            className={styles.btn}
            onClick={() => setMode("quick")}
          >
            <span>← Back to quick</span>
          </button>
        </div>
      )}
    </div>
  );
}
