import { formatHourLabel, formatHourMinute12 } from "~/lib/actions/dates";
import styles from "./TimelineRail.module.css";

export interface RailBlock {
  id: string;
  title: string;
  start: number;
  end: number;
  kind: "cal" | "task" | "focus";
}

interface TimelineRailProps {
  dayLabel: string;
  eventsCount: number;
  focusCount: number;
  blocks: RailBlock[];
  range: [number, number];
  now: number;
}

const blockClass = {
  cal: styles.blockCal,
  task: styles.blockTask,
  focus: styles.blockFocus,
};

export function TimelineRail({
  dayLabel,
  eventsCount,
  focusCount,
  blocks,
  range,
  now,
}: TimelineRailProps) {
  const [start, end] = range;
  const hourHeight = 48;
  return (
    <aside className={styles.rail}>
      <div className={styles.head}>
        <div>
          <div className={styles.date}>{dayLabel}</div>
          <div className={styles.sub}>
            {eventsCount} event{eventsCount === 1 ? "" : "s"} · {focusCount}{" "}
            focus block{focusCount === 1 ? "" : "s"}
          </div>
        </div>
        <span className={styles.todayLabel}>Today</span>
      </div>
      <div
        className={styles.hours}
        style={{ position: "relative", height: (end - start) * hourHeight }}
      >
        {Array.from({ length: end - start }, (_, i) => {
          const hr = start + i;
          return (
            <div
              key={i}
              className={styles.hour}
              data-hour={formatHourLabel(hr)}
              style={{ top: i * hourHeight }}
            />
          );
        })}
        {blocks.map((ev) => {
          const clampedStart = Math.max(ev.start, start);
          const clampedEnd = Math.min(ev.end, end);
          if (clampedEnd <= clampedStart) return null;
          return (
            <div
              key={ev.id}
              className={`${styles.block} ${blockClass[ev.kind]}`}
              style={{
                top: (clampedStart - start) * hourHeight + 2,
                height: (clampedEnd - clampedStart) * hourHeight - 4,
              }}
            >
              <div>{ev.title}</div>
              <div className={styles.blockTime}>
                {formatHourMinute12(ev.start)} – {formatHourMinute12(ev.end)}
              </div>
            </div>
          );
        })}
        {now >= start && now <= end && (
          <div
            className={styles.now}
            style={{ top: (now - start) * hourHeight }}
          />
        )}
      </div>
    </aside>
  );
}
