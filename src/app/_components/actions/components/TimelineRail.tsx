import { formatHourLabel, formatHourMinute12 } from "~/lib/actions/dates";
import type { RailBlock } from "~/lib/actions/railBlocks";
import { layoutRailBlock } from "~/lib/actions/railLayout";
import styles from "./TimelineRail.module.css";

export type { RailBlock };

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
          const layout = layoutRailBlock(ev, {
            rangeStart: start,
            rangeEnd: end,
            hourPx: hourHeight,
          });
          if (!layout) return null;
          return (
            <div
              key={ev.id}
              className={`${styles.block} ${blockClass[ev.kind]}`}
              data-floored={layout.isFloored ? "true" : undefined}
              style={{ top: layout.top + 2, height: layout.height }}
              title={`${ev.title} · ${formatHourMinute12(ev.start)} – ${formatHourMinute12(ev.end)}`}
            >
              <div className={styles.blockTitle}>{ev.title}</div>
              {layout.showMeta && (
                <div className={styles.blockTime}>
                  {formatHourMinute12(ev.start)} – {formatHourMinute12(ev.end)}
                </div>
              )}
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
