'use client';

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { addWeeks, endOfISOWeek, getISOWeek, startOfISOWeek } from 'date-fns';
import { CoachingHeaderWheel } from './CoachingHeaderWheel';

interface CoachingHeroProps {
  workspaceName?: string;
  weekStart: Date;
  isCurrentWeek: boolean;
  onChangeWeek: (next: Date) => void;
}

function formatRange(weekStart: Date): string {
  const start = startOfISOWeek(weekStart);
  const end = endOfISOWeek(weekStart);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const endStr = end.toLocaleDateString(
    undefined,
    sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' },
  );
  return `${startStr} – ${endStr}`;
}

export function CoachingHero({
  workspaceName,
  weekStart,
  isCurrentWeek,
  onChangeWeek,
}: CoachingHeroProps) {
  const isoWeek = getISOWeek(weekStart);

  return (
    <header className="ch-hero">
      <div>
        <div className="ch-hero__eyebrow">
          <span className="ch-hero__pill">
            <span className="ch-hero__pill-dot" aria-hidden /> Coaching cadence
          </span>
          <div className="ch-hero__pager" role="group" aria-label="Week">
            <button
              type="button"
              className="ch-cta"
              style={{
                padding: '4px 6px',
                border: '0',
                background: 'transparent',
              }}
              aria-label="Previous week"
              onClick={() => onChangeWeek(startOfISOWeek(addWeeks(weekStart, -1)))}
            >
              <IconChevronLeft size={13} />
            </button>
            <span className="ch-hero__pager-label">
              <b>Week {isoWeek}</b>
              <span>·</span>
              <span className="ch-hero__pager-range">{formatRange(weekStart)}</span>
              {isCurrentWeek ? (
                <span className="ch-hero__pager-now">now</span>
              ) : null}
            </span>
            <button
              type="button"
              className="ch-cta"
              style={{
                padding: '4px 6px',
                border: '0',
                background: 'transparent',
              }}
              aria-label="Next week"
              onClick={() => onChangeWeek(startOfISOWeek(addWeeks(weekStart, 1)))}
            >
              <IconChevronRight size={13} />
            </button>
          </div>
        </div>

        <h1 className="ch-hero__title">
          {workspaceName ? `${workspaceName} coaching home.` : 'Coaching home.'}{' '}
          <em>Here&apos;s the week — what shifted, what didn&apos;t.</em>
        </h1>

        <p className="ch-hero__sub">
          The reflection scopes to the selected week; the focus goals stay
          current. Pick a different week from the pager to revisit a past
          reflection.
        </p>
      </div>

      <div>
        <CoachingHeaderWheel />
      </div>
    </header>
  );
}
