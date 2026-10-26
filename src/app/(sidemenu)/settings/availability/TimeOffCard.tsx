'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { api } from '~/trpc/react';

const HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function atTime(date: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours ?? 0, minutes ?? 0);
}

function formatBlock(block: { startsAt: Date; endsAt: Date; isAllDay: boolean }): string {
  const day = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (block.isAllDay) {
    // Stored end is the midnight after the last day.
    const lastDay = new Date(block.endsAt.getTime() - 1);
    return lastDay.toDateString() === block.startsAt.toDateString()
      ? day(block.startsAt)
      : `${day(block.startsAt)} – ${day(lastDay)}`;
  }
  return block.startsAt.toDateString() === block.endsAt.toDateString()
    ? `${day(block.startsAt)}, ${time(block.startsAt)} – ${time(block.endsAt)}`
    : `${day(block.startsAt)} ${time(block.startsAt)} – ${day(block.endsAt)} ${time(block.endsAt)}`;
}

/**
 * Upcoming marked time — painted on the grid or added here with a note —
 * and the form for time off that runs longer than a week's grid can show.
 */
export function TimeOffCard() {
  const utils = api.useUtils();
  const { data: blocks, isLoading } = api.availability.listUpcoming.useQuery();
  const [opened, setOpened] = useState(false);

  const invalidate = async () => {
    await Promise.all([
      utils.availability.listUpcoming.invalidate(),
      utils.availability.myGrid.invalidate(),
    ]);
  };

  const remove = api.availability.remove.useMutation({
    onSuccess: invalidate,
    onError: (error) =>
      notifications.show({ title: "Couldn't remove it", message: error.message, color: 'red' }),
  });

  return (
    <Paper p="lg" withBorder className="bg-surface-secondary">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4} className="text-text-primary">
              Time off and appointments
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              Everything you&apos;ve marked from now on. Notes are only shown to you.
            </Text>
          </div>
          <Button leftSection={<IconPlus size={16} />} size="xs" onClick={() => setOpened(true)}>
            Add time off
          </Button>
        </Group>

        {isLoading ? (
          <Skeleton height={60} />
        ) : !blocks || blocks.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing marked yet.
          </Text>
        ) : (
          <Stack gap="xs">
            {blocks.map((block) => (
              <Group key={block.id} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" className="min-w-0">
                  <Text size="sm" className="text-text-primary">
                    {formatBlock(block)}
                  </Text>
                  {block.isAllDay && (
                    <Badge size="xs" variant="light" color="gray">
                      All day
                    </Badge>
                  )}
                  {block.note && (
                    <Text size="sm" c="dimmed" truncate>
                      {block.note}
                    </Text>
                  )}
                </Group>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="Remove"
                  loading={remove.isPending && remove.variables?.id === block.id}
                  onClick={() => remove.mutate({ id: block.id })}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>

      <AddTimeOffModal opened={opened} onClose={() => setOpened(false)} onSaved={invalidate} />
    </Paper>
  );
}

function AddTimeOffModal({
  opened,
  onClose,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [dates, setDates] = useState<[Date | null, Date | null]>([null, null]);
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [note, setNote] = useState('');

  const reset = () => {
    setDates([null, null]);
    setAllDay(true);
    setStart('09:00');
    setEnd('17:00');
    setNote('');
  };

  const add = api.availability.add.useMutation({
    onSuccess: async () => {
      await onSaved();
      reset();
      onClose();
    },
    onError: (error) =>
      notifications.show({ title: "Couldn't save it", message: error.message, color: 'red' }),
  });

  const [firstDay, lastDayPicked] = dates;
  const lastDay = lastDayPicked ?? firstDay;
  const range =
    firstDay && lastDay
      ? allDay
        ? {
            startsAt: new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate()),
            endsAt: new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1),
          }
        : HHMM_REGEX.test(start) && HHMM_REGEX.test(end)
          ? { startsAt: atTime(firstDay, start), endsAt: atTime(lastDay, end) }
          : null
      : null;
  const ordered = !range || range.endsAt > range.startsAt;

  return (
    <Modal opened={opened} onClose={onClose} title="Add time off">
      <Stack gap="md">
        <DatePickerInput
          type="range"
          label="Dates"
          placeholder="Pick a day or a range"
          value={dates}
          onChange={setDates}
          allowSingleDateInRange
          minDate={new Date()}
        />
        <Switch
          label="All day"
          checked={allDay}
          onChange={(event) => setAllDay(event.currentTarget.checked)}
        />
        {!allDay && (
          <Group gap="md" align="flex-start">
            <TimeInput
              label="From"
              value={start}
              onChange={(event) => setStart(event.currentTarget.value)}
              className="flex-1"
            />
            <TimeInput
              label="Until"
              value={end}
              onChange={(event) => setEnd(event.currentTarget.value)}
              error={!ordered ? 'Must be after the start' : undefined}
              className="flex-1"
            />
          </Group>
        )}
        <TextInput
          label="Note"
          description="Only you see this. Teammates just see you as busy."
          placeholder="e.g. Holiday, dentist"
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={add.isPending}
            disabled={!range || !ordered}
            onClick={() => {
              if (!range || !ordered) return;
              add.mutate({ range, isAllDay: allDay, note: note.trim() || undefined });
            }}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
