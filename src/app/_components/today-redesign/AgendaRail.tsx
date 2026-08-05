import React, { useMemo, useState } from "react";
import type { RailBlock } from "~/lib/actions/railBlocks";
import { layoutRailBlocks } from "~/lib/actions/railLayout";
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
  const [openOverflow, setOpenOverflow] = useState<string | null>(null);
  const { positioned, overflows } = useMemo(
    () =>
      layoutRailBlocks(blocks, {
        rangeStart: START_HR,
        rangeEnd: END_HR,
        hourPx: HOUR_PX,
      }),
    [blocks],
  );
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

          {positioned.map(({ block: b, ...layout }) => {
            const tone = b.kind === "cal" ? "blue" : "amber";
            return (
              <div
                key={b.id}
                className={`td-event td-event--${tone}`}
                data-floored={layout.isFloored ? "true" : undefined}
                style={{
                  top: layout.top,
                  height: layout.height,
                  left: `${layout.leftPct}%`,
                  width: `${layout.widthPct}%`,
                }}
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

          {overflows.map((o) => (
            <div
              key={o.key}
              className="td-event-more"
              style={{
                top: o.top,
                height: o.height,
                left: `${o.leftPct}%`,
                width: `${o.widthPct}%`,
              }}
            >
              <button
                type="button"
                className="td-event-more__btn"
                aria-expanded={openOverflow === o.key}
                onClick={() =>
                  setOpenOverflow((cur) => (cur === o.key ? null : o.key))
                }
              >
                +{o.hidden.length} more
              </button>
              {openOverflow === o.key && (
                <div className="td-event-more__panel" role="list">
                  {o.hidden.map((h) => (
                    <div key={h.id} className="td-event-more__item" role="listitem">
                      <div className="td-event-more__item-title">
                        {stripHtml(h.title)}
                      </div>
                      <div className="td-event-more__item-time">
                        {formatHourMinute12(h.start)} – {formatHourMinute12(h.end)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
