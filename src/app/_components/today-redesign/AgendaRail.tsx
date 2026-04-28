import React from "react";
import type { RailBlock } from "../actions/components/TimelineRail";
import { formatHourLabel, formatHourMinute12 } from "~/lib/actions/dates";

const HOUR_PX = 48;
const START_HR = 7;
const END_HR = 20;

interface AgendaRailProps {
  dayLabel: string;
  eventsCount: number;
  blocks: RailBlock[];
  now: number;
}

export function AgendaRail({ dayLabel, eventsCount, blocks, now }: AgendaRailProps) {
  const totalHrs = END_HR - START_HR;
  return (
    <aside className="td-rail">
      <div className="td-rail__header">
        <div>
          <div className="td-rail__date">{dayLabel}</div>
          <div className="td-rail__count">
            {eventsCount} event{eventsCount === 1 ? "" : "s"}
          </div>
        </div>
        <span className="td-pill--today">Today</span>
      </div>

      <div className="td-rail__scroll">
        <div className="td-timeline" style={{ height: totalHrs * HOUR_PX }}>
          {Array.from({ length: totalHrs + 1 }).map((_, i) => {
            const hr = START_HR + i;
            return (
              <React.Fragment key={i}>
                <div
                  className="td-timeline__hour-label"
                  style={{ top: i * HOUR_PX - 6 }}
                >
                  {formatHourLabel(hr)}
                </div>
                <div
                  className="td-timeline__hour-line"
                  style={{ top: i * HOUR_PX }}
                />
              </React.Fragment>
            );
          })}

          {now >= START_HR && now <= END_HR && (
            <div
              className="td-timeline__now"
              style={{ top: (now - START_HR) * HOUR_PX }}
            >
              <div className="td-timeline__now-dot" />
              <div className="td-timeline__now-line" />
            </div>
          )}

          {blocks.map((b) => {
            const clampedStart = Math.max(b.start, START_HR);
            const clampedEnd = Math.min(b.end, END_HR);
            if (clampedEnd <= clampedStart) return null;
            const tone = b.kind === "cal" ? "blue" : "amber";
            return (
              <div
                key={b.id}
                className={`td-event td-event--${tone}`}
                style={{
                  top: (clampedStart - START_HR) * HOUR_PX,
                  height: (clampedEnd - clampedStart) * HOUR_PX - 4,
                }}
              >
                <div className="td-event__title">{b.title}</div>
                <div className="td-event__meta">
                  {formatHourMinute12(b.start)} – {formatHourMinute12(b.end)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
