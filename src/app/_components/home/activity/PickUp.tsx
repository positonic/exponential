'use client';

import { Skeleton } from '@mantine/core';
import {
  IconInbox,
  IconRepeat,
  IconTarget,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

interface PickUpCard {
  key: string;
  title: string;
  iconClass: string;
  Icon: TablerIcon;
}

const CARDS: PickUpCard[] = [
  { key: 'ritual', title: 'Morning ritual', iconClass: 'wsa-pickup__icon--ritual', Icon: IconRepeat },
  { key: 'inbox', title: 'Inbox triage', iconClass: 'wsa-pickup__icon--knowledge', Icon: IconInbox },
  { key: 'okr', title: 'Quarterly OKR check-in', iconClass: 'wsa-pickup__icon--okr', Icon: IconTarget },
];

/**
 * "Pick up where you left off" section. Skeleton for slice T2 — the live
 * suggestions land later. We still render the icon tiles and titles so the
 * section communicates its intent at a glance.
 */
export function PickUp() {
  return (
    <section>
      <div className="wsa-card__head" style={{ marginBottom: 10 }}>
        <h2 className="wsa-card__title">Pick up where you left off</h2>
        <span className="wsa-card__caption">Coming soon</span>
      </div>
      <div className="wsa-pickup__grid">
        {CARDS.map((card) => {
          const Icon = card.Icon;
          return (
            <div key={card.key} className="wsa-pickup__card">
              <span className={`wsa-pickup__icon ${card.iconClass}`}>
                <Icon size={16} stroke={1.8} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {card.title}
                </div>
                <Skeleton height={14} mt={6} width="60%" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
