'use client';

import { ActionIcon, Group, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import {
  addWeeks,
  endOfISOWeek,
  getISOWeek,
  getISOWeekYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
} from 'date-fns';

interface CoachingWeekSelectorProps {
  weekStart: Date;
  onChange: (weekStart: Date) => void;
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
  return `Week of ${startStr} – ${endStr}`;
}

export function isoWeekStringFromDate(date: Date): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function dateFromIsoWeekString(value: string): Date | null {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  let d = new Date(year, 0, 4); // Jan 4 always falls in ISO week 1
  d = setISOWeekYear(d, year);
  d = setISOWeek(d, week);
  return startOfISOWeek(d);
}

export function CoachingWeekSelector({
  weekStart,
  onChange,
}: CoachingWeekSelectorProps) {
  return (
    <Group
      gap={6}
      align="center"
      className="rounded-full border border-border-primary bg-surface-primary px-2 py-1"
    >
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label="Previous week"
        onClick={() => onChange(startOfISOWeek(addWeeks(weekStart, -1)))}
      >
        <IconChevronLeft size={14} />
      </ActionIcon>
      <Text size="xs" fw={500} className="text-text-primary">
        {formatRange(weekStart)}
      </Text>
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label="Next week"
        onClick={() => onChange(startOfISOWeek(addWeeks(weekStart, 1)))}
      >
        <IconChevronRight size={14} />
      </ActionIcon>
    </Group>
  );
}
