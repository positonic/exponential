'use client';

import { Button } from '@mantine/core';
import {
  IconArrowRight,
  IconBook2,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { endOfISOWeek, isWithinInterval, startOfISOWeek } from 'date-fns';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';

interface CoachingWeeklyReflectionProps {
  weekStart: Date;
}

function formatWeekRange(weekStart: Date): string {
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

function PastReflectionRow({
  reflection,
}: {
  reflection: {
    id: number;
    content: string;
    day: { date: Date | string } | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const dayDate = reflection.day?.date ? new Date(reflection.day.date) : null;
  const rangeLabel = dayDate ? formatWeekRange(dayDate) : 'Unknown week';
  const content = reflection.content.trim();

  return (
    <button
      type="button"
      className="ch-reflect__hrow"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
    >
      <span className="ch-reflect__hweek">{rangeLabel}</span>
      <span className={`ch-reflect__hline${open ? ' is-open' : ''}`}>
        {content || 'No reflection text.'}
      </span>
      {open ? (
        <IconChevronDown size={14} className="ch-reflect__harrow" />
      ) : (
        <IconChevronRight size={14} className="ch-reflect__harrow" />
      )}
    </button>
  );
}

export function CoachingWeeklyReflection({
  weekStart,
}: CoachingWeeklyReflectionProps) {
  const utils = api.useUtils();
  const { data: current, isLoading } = api.note.getWeeklyReflection.useQuery({
    weekStart,
  });
  const { data: recent } = api.note.listRecentWeeklyReflections.useQuery({
    count: 5,
  });

  const upsert = api.note.upsertWeeklyReflection.useMutation({
    onSuccess: async () => {
      await utils.note.getWeeklyReflection.invalidate({ weekStart });
      await utils.note.listRecentWeeklyReflections.invalidate();
    },
  });

  const [draft, setDraft] = useState('');
  useEffect(() => {
    setDraft(current?.content ?? '');
  }, [current?.id, current?.content]);

  const dirty = draft !== (current?.content ?? '');
  const isEmpty = !current && !isLoading;
  const status = upsert.isPending
    ? 'saving…'
    : dirty
    ? 'unsaved'
    : isEmpty
    ? 'new draft'
    : 'saved';

  const past = (recent ?? []).filter((r) => {
    if (!r.day?.date) return true;
    const d = new Date(r.day.date);
    return !isWithinInterval(d, {
      start: startOfISOWeek(weekStart),
      end: endOfISOWeek(weekStart),
    });
  });

  return (
    <section className="ch-block">
      <div className="ch-reflect__card">
        <div className="ch-reflect__head">
          <span className="ch-reflect__title">
            <IconBook2 size={14} /> Weekly reflection
          </span>
          <span className="ch-reflect__week">
            {formatWeekRange(weekStart)}
            <span className="ch-reflect__week-dot" aria-hidden />
            <span className="ch-reflect__week-status">{status}</span>
          </span>
        </div>

        <div className="ch-reflect__body">
          <div className="ch-reflect__prompt">
            What went well? What did you learn? Where are you stuck?
          </div>
          <textarea
            className="ch-reflect__textarea"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            placeholder={isLoading ? 'Loading…' : 'Start this week’s reflection…'}
            disabled={isLoading || upsert.isPending}
          />
          <div className="ch-reflect__actions">
            <Button
              size="xs"
              variant="filled"
              color="violet"
              disabled={!dirty || upsert.isPending}
              onClick={() => upsert.mutate({ weekStart, content: draft })}
            >
              Save reflection
            </Button>
            {!isEmpty ? (
              <div className="ch-reflect__autosave">
                <span className="ch-reflect__autosave-dot" aria-hidden /> {status}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {past.length > 0 ? (
        <div className="ch-reflect__history">
          <div className="ch-reflect__history-head">
            <span>Last {Math.min(4, past.length)} weeks</span>
            <a className="ch-reflect__history-link" href="/journal">
              Open journal <IconArrowRight size={11} />
            </a>
          </div>
          <ul className="ch-reflect__history-list">
            {past.slice(0, 4).map((r) => (
              <li key={r.id}>
                <PastReflectionRow reflection={r} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
