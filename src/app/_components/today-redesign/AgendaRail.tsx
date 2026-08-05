import React from "react";
import type { RailBlock } from "~/lib/actions/railBlocks";
import { layoutRailBlock } from "~/lib/actions/railLayout";
import { formatHourLabel, formatHourMinute12 } from "~/lib/actions/dates";
import { stripHtml } from "~/lib/utils";

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
            const layout = layoutRailBlock(b, {
              rangeStart: START_HR,
              rangeEnd: END_HR,
              hourPx: HOUR_PX,
            });
            if (!layout) return null;
            const tone = b.kind === "cal" ? "blue" : "amber";
            return (
              <div
                key={b.id}
                className={`td-event td-event--${tone}`}
                data-floored={layout.isFloored ? "true" : undefined}
                style={{ top: layout.top, height: layout.height }}
                title={`${stripHtml(b.title)} · ${formatHourMinute12(b.start)} – ${formatHourMinute12(b.end)}`}
              >
                <div className="td-event__title">{stripHtml(b.title)}</div>
                {layout.showMeta && (
                  <div className="td-event__meta">
                    {formatHourMinute12(b.start)} – {formatHourMinute12(b.end)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
