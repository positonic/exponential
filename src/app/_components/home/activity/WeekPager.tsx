'use client';

import { ActionIcon, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import {
  addWeeks,
  endOfISOWeek,
  getISOWeek,
  getISOWeekYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
  subWeeks,
} from 'date-fns';
import { useMemo, useState } from 'react';

export interface IsoWeek {
  isoYear: number;
  isoWeek: number;
}

export function isoWeekOf(date: Date): IsoWeek {
  return { isoYear: getISOWeekYear(date), isoWeek: getISOWeek(date) };
}

/** Reconstruct a Date that lands inside the given ISO week (its Monday). */
export function dateForIsoWeek({ isoYear, isoWeek }: IsoWeek): Date {
  // Order matters: set the ISO-week-year first, then the week within it.
  return startOfISOWeek(setISOWeek(setISOWeekYear(new Date(), isoYear), isoWeek));
}

export function sameIsoWeek(a: IsoWeek, b: IsoWeek): boolean {
  return a.isoYear === b.isoYear && a.isoWeek === b.isoWeek;
}

const FMT_DATE = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Selected-ISO-week state for a per-week panel (the Weekly work digest, the
 * Person week summary). Starts on the current week, pages back freely and
 * never forward past the current week.
 */
export function useWeekPager() {
  const currentWeek = useMemo(() => isoWeekOf(new Date()), []);
  const [selected, setSelected] = useState<IsoWeek>(currentWeek);
  const isCurrentWeek = sameIsoWeek(selected, currentWeek);

  const goPrevWeek = () => {
    setSelected(isoWeekOf(subWeeks(dateForIsoWeek(selected), 1)));
  };

  const goNextWeek = () => {
    if (isCurrentWeek) return;
    const next = isoWeekOf(addWeeks(dateForIsoWeek(selected), 1));
    // Clamp to the current week — never page into the future.
    const isFuture =
      dateForIsoWeek(next).getTime() > dateForIsoWeek(currentWeek).getTime();
    setSelected(sameIsoWeek(next, currentWeek) || isFuture ? currentWeek : next);
  };

  const goCurrentWeek = () => setSelected(currentWeek);

  const weekRef = dateForIsoWeek(selected);
  const rangeLabel = `${FMT_DATE(startOfISOWeek(weekRef))} – ${FMT_DATE(endOfISOWeek(weekRef))}`;

  return {
    selected,
    isCurrentWeek,
    /** "This week", or the week's date range. */
    label: isCurrentWeek ? 'This week' : rangeLabel,
    /**
     * Week fields for a query input. Empty for the current week, so the
     * server resolves "now" itself.
     */
    weekInput: isCurrentWeek
      ? {}
      : { isoYear: selected.isoYear, isoWeek: selected.isoWeek },
    goPrevWeek,
    goNextWeek,
    goCurrentWeek,
  };
}

interface WeekPagerProps {
  label: string;
  isCurrentWeek: boolean;
  /** Disables every control (loading or regenerating). */
  busy: boolean;
  isRegenerating: boolean;
  /** What regenerate rewrites, for its tooltip and label: "digest", "summary". */
  noun: string;
  onPrev: () => void;
  onNext: () => void;
  onRegenerate: () => void;
}

/** Previous / next week and regenerate, as shown in a per-week panel's header. */
export function WeekPager({
  label,
  isCurrentWeek,
  busy,
  isRegenerating,
  noun,
  onPrev,
  onNext,
  onRegenerate,
}: WeekPagerProps) {
  return (
    <div className="wsa-digest__pager">
      <Tooltip label="Previous week" withArrow position="top">
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label="Previous week"
          disabled={busy}
          onClick={onPrev}
        >
          <IconChevronLeft size={15} stroke={1.8} />
        </ActionIcon>
      </Tooltip>
      <span className="wsa-digest__pager-label">{label}</span>
      <Tooltip
        label={isCurrentWeek ? 'No future weeks' : 'Next week'}
        withArrow
        position="top"
      >
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label="Next week"
          disabled={busy || isCurrentWeek}
          onClick={onNext}
        >
          <IconChevronRight size={15} stroke={1.8} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={`Regenerate ${noun}`} withArrow position="top">
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label={`Regenerate ${noun}`}
          disabled={busy}
          loading={isRegenerating}
          onClick={onRegenerate}
        >
          <IconRefresh size={14} stroke={1.8} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}

/** The tRPC error code of a caught error, if it has one. */
export function trpcErrorCode(err: unknown): unknown {
  return err != null &&
    typeof err === 'object' &&
    'data' in err &&
    err.data != null &&
    typeof err.data === 'object' &&
    'code' in err.data
    ? (err.data as { code?: unknown }).code
    : undefined;
}
