'use client';

import { Skeleton, Tooltip } from '@mantine/core';
import { IconActivity } from '@tabler/icons-react';

const RANGES = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
] as const;

/**
 * Heatmap card placeholder. Renders the card chrome, the disabled
 * Week/Month/Year filter pills, and a single Skeleton bar where the
 * GitHub-style contribution graph will land.
 */
export function Heatmap() {
  const activeRange: (typeof RANGES)[number]['key'] = 'year';

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
      <Skeleton height={140} />
      <p className="wsa-card__caption" style={{ marginTop: 12 }}>
        Coming soon — heatmap of your workspace activity over the last 12 months.
      </p>
    </section>
  );
}
