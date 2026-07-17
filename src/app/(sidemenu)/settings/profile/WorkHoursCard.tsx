'use client';

import { useEffect, useState } from 'react';
import {
  Paper,
  Title,
  Text,
  Group,
  Button,
  Switch,
  Skeleton,
  Stack,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import { api } from '~/trpc/react';

const WORK_DAY_OPTIONS = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
] as const;

const HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function WorkHoursCard() {
  const utils = api.useUtils();
  const { data: workHours, isLoading } = api.user.getWorkHours.useQuery();

  const [enabled, setEnabled] = useState(false);
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');

  useEffect(() => {
    if (workHours) {
      setEnabled(workHours.workHoursEnabled);
      setWorkDays(
        workHours.workDays.length > 0
          ? workHours.workDays
          : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      );
      setStart(workHours.workHoursStart ?? '09:00');
      setEnd(workHours.workHoursEnd ?? '17:00');
    }
  }, [workHours]);

  const updateWorkHours = api.user.updateWorkHours.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.user.getWorkHours.invalidate(),
        utils.dailyPlan.getUserWorkHours.invalidate(),
      ]);
      notifications.show({
        title: 'Work hours saved',
        message: 'Daily-plan scheduling will use your new hours.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to save work hours. Please try again.',
        color: 'red',
      });
    },
  });

  const toggleWorkDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const validTimes = HHMM_REGEX.test(start) && HHMM_REGEX.test(end);
  const timesOrdered = !validTimes || start < end;

  const handleSave = () => {
    if (!validTimes || !timesOrdered) return;
    updateWorkHours.mutate({
      workHoursEnabled: enabled,
      workDays,
      workHoursStart: start,
      workHoursEnd: end,
    });
  };

  if (isLoading) {
    return <Skeleton height={220} />;
  }

  return (
    <Paper p="lg" withBorder className="bg-surface-secondary">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4} className="text-text-primary">
              Work hours
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              Used by daily-plan scheduling. When off, scheduling falls back to
              default hours.
            </Text>
          </div>
          <Switch
            checked={enabled}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
            label="Enabled"
            labelPosition="left"
          />
        </Group>

        <div>
          <Text size="sm" fw={500} className="text-text-primary mb-2">
            Work days
          </Text>
          <Group gap="xs">
            {WORK_DAY_OPTIONS.map((day) => (
              <Button
                key={day.value}
                size="xs"
                variant={workDays.includes(day.value) ? 'filled' : 'outline'}
                color={workDays.includes(day.value) ? 'brand' : 'gray'}
                className={
                  workDays.includes(day.value)
                    ? ''
                    : 'border-border-primary text-text-primary'
                }
                onClick={() => toggleWorkDay(day.value)}
                disabled={!enabled}
              >
                {day.label}
              </Button>
            ))}
          </Group>
        </div>

        <Group gap="md" align="flex-start">
          <TimeInput
            label="Start time"
            value={start}
            onChange={(event) => setStart(event.currentTarget.value)}
            disabled={!enabled}
            className="flex-1"
          />
          <TimeInput
            label="End time"
            value={end}
            onChange={(event) => setEnd(event.currentTarget.value)}
            disabled={!enabled}
            error={!timesOrdered ? 'End time must be after start time' : undefined}
            className="flex-1"
          />
        </Group>

        <Group justify="flex-end">
          <Button
            onClick={handleSave}
            loading={updateWorkHours.isPending}
            disabled={!validTimes || !timesOrdered}
          >
            Save work hours
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
