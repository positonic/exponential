"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatHourLabel, formatHourMinute12 } from "~/lib/actions/dates";
import type { RailBlock } from "~/lib/actions/railBlocks";
import { layoutRailBlocks } from "~/lib/actions/railLayout";
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
  const [openOverflow, setOpenOverflow] = useState<string | null>(null);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const { positioned, overflows } = useMemo(
    () =>
      layoutRailBlocks(blocks, {
        rangeStart: start,
        rangeEnd: end,
        hourPx: hourHeight,
      }),
    [blocks, end, start],
  );

  useEffect(() => {
    if (!openOverflow) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!overflowRef.current?.contains(event.target as Node)) {
        setOpenOverflow(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOverflow(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openOverflow]);

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
        {positioned.map(({ block: ev, ...layout }) => {
          return (
            <div
              key={ev.id}
              className={`${styles.block} ${blockClass[ev.kind]}`}
              data-floored={layout.isFloored ? "true" : undefined}
              style={{
                top: layout.top + 2,
                height: layout.height,
                left: `${layout.leftPct}%`,
                right: "auto",
                width: `${layout.widthPct}%`,
              }}
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
        {overflows.map((overflow) => (
          <div
            key={overflow.key}
            ref={openOverflow === overflow.key ? overflowRef : undefined}
            className={styles.more}
            data-open={openOverflow === overflow.key ? "true" : undefined}
            style={{
              top: overflow.top + 2,
              left: `${overflow.leftPct}%`,
              width: `${overflow.widthPct}%`,
            }}
          >
            <button
              type="button"
              className={styles.moreButton}
              aria-expanded={openOverflow === overflow.key}
              onClick={() =>
                setOpenOverflow((current) =>
                  current === overflow.key ? null : overflow.key,
                )
              }
            >
              +{overflow.hidden.length} more
            </button>
            {openOverflow === overflow.key && (
              <div className={styles.morePanel} role="list">
                {overflow.hidden.map((hidden) => (
                  <div key={hidden.id} className={styles.moreItem} role="listitem">
                    <div className={styles.moreItemTitle}>{hidden.title}</div>
                    <div className={styles.moreItemTime}>
                      {formatHourMinute12(hidden.start)} – {formatHourMinute12(hidden.end)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
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
