'use client';

import { Skeleton, Tooltip } from '@mantine/core';
import { IconActivity } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

const RANGES = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
] as const;

interface TooltipState {
  count: number;
  date: string;
  /** Pixel x in the scroll container. */
  x: number;
  /** Pixel y in the scroll container. */
  y: number;
}

function formatDateForTip(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * 12-month workspace activity heatmap. 53 columns × 7 rows.
 *
 * Data comes from `workspace.getActivityHeatmap` which counts every
 * `WorkspaceActivityEvent` row in the window and buckets by day. The
 * server emits a `HeatmapCell[]` with `level` (0–4) and `isToday`
 * already computed; this component only handles rendering + tooltip
 * state.
 */
export function Heatmap() {
  const { workspaceId } = useWorkspace();
  const activeRange: (typeof RANGES)[number]['key'] = 'year';

  const { data, isLoading } = api.workspace.getActivityHeatmap.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const [tip, setTip] = useState<TooltipState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const cells = data?.cells;
  const total = data?.total ?? 0;

  const headerCount = useMemo(() => {
    if (!data) return null;
    return total.toLocaleString();
  }, [data, total]);

  return (
    <section className="wsa-card">
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconActivity size={14} stroke={1.8} />
          Activity
          <span className="wsa-card__count">last 12 months</span>
        </h2>
        <Tooltip label="Coming soon" withArrow>
          <div className="wsa-projects__seg" aria-disabled="true">
            {RANGES.map((range) => (
              <button
                type="button"
                key={range.key}
                disabled
                className="wsa-projects__seg-btn"
                data-active={activeRange === range.key}
                aria-disabled="true"
              >
                {range.label}
              </button>
            ))}
          </div>
        </Tooltip>
      </div>

      {isLoading || !cells ? (
        <Skeleton height={140} />
      ) : (
        <div className="wsa-heatmap__scroll" ref={scrollRef}>
          <div className="wsa-heatmap__grid">
            {cells.map((c, i) => (
              <button
                type="button"
                key={i}
                className="wsa-heatmap__cell"
                data-l={c.level}
                data-today={c.isToday || undefined}
                aria-label={`${c.count} ${c.count === 1 ? 'event' : 'events'} on ${formatDateForTip(c.date)}`}
                onMouseEnter={(e) => {
                  const cell = e.currentTarget;
                  const container = scrollRef.current;
                  if (!container) return;
                  const cellRect = cell.getBoundingClientRect();
                  const parentRect = container.getBoundingClientRect();
                  setTip({
                    count: c.count,
                    date: formatDateForTip(c.date),
                    x: cellRect.left - parentRect.left + cellRect.width / 2,
                    y: cellRect.top - parentRect.top,
                  });
                }}
                onMouseLeave={() => setTip(null)}
                onFocus={(e) => {
                  // Mirror mouseenter for keyboard users so the tooltip stays
                  // accessible.
                  e.currentTarget.dispatchEvent(
                    new MouseEvent('mouseenter', { bubbles: false }),
                  );
                }}
                onBlur={() => setTip(null)}
              />
            ))}
          </div>
          {tip ? (
            <div
              className="wsa-heatmap__tip"
              style={{ left: tip.x, top: tip.y }}
              role="status"
            >
              <strong>{tip.count}</strong>{' '}
              {tip.count === 1 ? 'event' : 'events'} · {tip.date}
            </div>
          ) : null}
        </div>
      )}

      <div className="wsa-heatmap__foot">
        <div className="wsa-heatmap__total">
          {data ? (
            <>
              <b>{headerCount}</b>{' '}
              {total === 1 ? 'event' : 'events'} in the last 12 months
            </>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </div>
        <div className="wsa-heatmap__legend">
          Less
          <div className="wsa-heatmap__legend-cells">
            <div className="wsa-heatmap__legend-cell" />
            <div className="wsa-heatmap__legend-cell" data-l="1" />
            <div className="wsa-heatmap__legend-cell" data-l="2" />
            <div className="wsa-heatmap__legend-cell" data-l="3" />
            <div className="wsa-heatmap__legend-cell" data-l="4" />
          </div>
          More
        </div>
      </div>
    </section>
  );
}
