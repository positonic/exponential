'use client';

import { Skeleton } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';

/**
 * Activity-feed card placeholder. Three skeleton rows + caption. Real data
 * (audit-log style timeline of workspace events) wires later.
 */
export function ActivityFeed() {
  return (
    <section className="wsa-card">
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconClipboardList size={14} stroke={1.8} />
          Activity feed
          <span className="wsa-card__count">today</span>
        </h2>
      </div>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          style={{
            display: 'grid',
            gridTemplateColumns: '32px minmax(0, 1fr)',
            gap: 12,
            alignItems: 'center',
            padding: '10px 0',
          }}
        >
          <Skeleton circle height={32} width={32} />
          <div>
            <Skeleton height={14} width="68%" />
            <Skeleton height={12} mt={6} width="42%" />
          </div>
        </div>
      ))}
      <p className="wsa-card__caption" style={{ marginTop: 8 }}>
        Coming soon — your workspace activity as it happens.
      </p>
    </section>
  );
}
