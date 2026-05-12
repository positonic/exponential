'use client';

import {
  Button,
  Collapse,
  Group,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
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
  const dayDate = reflection.day?.date
    ? new Date(reflection.day.date)
    : null;
  const rangeLabel = dayDate ? formatWeekRange(dayDate) : 'Unknown week';

  return (
    <Stack gap={4}>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded text-left hover:bg-surface-hover"
      >
        {open ? (
          <IconChevronDown size={14} className="text-text-muted" aria-hidden />
        ) : (
          <IconChevronRight size={14} className="text-text-muted" aria-hidden />
        )}
        <Text size="xs" className="text-text-secondary">
          {rangeLabel}
        </Text>
      </UnstyledButton>
      <Collapse in={open}>
        <Text size="xs" className="whitespace-pre-wrap pl-5 text-text-secondary">
          {reflection.content.trim() || 'No reflection text.'}
        </Text>
      </Collapse>
    </Stack>
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

  const past = (recent ?? []).filter((r) => {
    if (!r.day?.date) return true;
    const d = new Date(r.day.date);
    return !isWithinInterval(d, {
      start: startOfISOWeek(weekStart),
      end: endOfISOWeek(weekStart),
    });
  });

  return (
    <Stack
      gap="sm"
      className="rounded-lg border border-border-primary bg-surface-primary p-4"
    >
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600} className="text-text-primary">
          Weekly reflection · {formatWeekRange(weekStart)}
        </Text>
        {upsert.isPending ? (
          <Text size="xs" className="text-text-muted">
            Saving…
          </Text>
        ) : null}
      </Group>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        placeholder={
          isLoading
            ? 'Loading…'
            : 'What went well? What did you learn? Where are you stuck?'
        }
        minRows={4}
        autosize
        disabled={isLoading || upsert.isPending}
        classNames={{
          input:
            'bg-surface-secondary text-text-primary border-border-primary placeholder:text-text-muted',
        }}
      />

      <Group justify="flex-end">
        <Button
          size="xs"
          variant="filled"
          disabled={!dirty || upsert.isPending}
          onClick={() =>
            upsert.mutate({ weekStart, content: draft })
          }
        >
          Save reflection
        </Button>
      </Group>

      {past.length > 0 ? (
        <Stack gap={4} className="pt-2">
          <Text size="xs" fw={500} className="text-text-secondary">
            Past weeks
          </Text>
          {past.slice(0, 4).map((r) => (
            <PastReflectionRow key={r.id} reflection={r} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
