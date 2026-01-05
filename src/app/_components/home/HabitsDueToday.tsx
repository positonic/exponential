'use client';

import { Text, Stack, Group, Checkbox } from '@mantine/core';
import { api } from '~/trpc/react';

export function HabitsDueToday() {
  const { data: habitStatus, isLoading } = api.habit.getTodayStatus.useQuery();
  const utils = api.useUtils();

  const toggleCompletion = api.habit.toggleCompletion.useMutation({
    onSuccess: () => {
      void utils.habit.getTodayStatus.invalidate();
    },
  });

  const handleToggle = (habitId: string, _isCompleted: boolean) => {
    toggleCompletion.mutate({
      habitId,
      date: new Date(),
    });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-surface-hover rounded w-1/4" />
        <div className="h-8 bg-surface-hover rounded" />
      </div>
    );
  }

  if (!habitStatus || habitStatus.length === 0) {
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500} className="text-text-secondary">
          Habits
        </Text>
        <Text size="sm" className="text-text-muted">
          No habits set up yet. Create habits linked to your goals for daily practice.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500} className="text-text-secondary">
        Habits
      </Text>
      <Stack gap="xs">
        {habitStatus.map((habit) => (
          <Group
            key={habit.id}
            gap="sm"
            className="p-2 rounded-md hover:bg-surface-hover transition-colors"
          >
            <Checkbox
              checked={habit.isCompletedToday}
              onChange={() => handleToggle(habit.id, habit.isCompletedToday)}
              disabled={toggleCompletion.isPending}
              size="sm"
            />
            <Text
              size="sm"
              className={habit.isCompletedToday ? 'text-text-muted line-through' : 'text-text-primary'}
              style={{ flex: 1 }}
            >
              {habit.title}
            </Text>
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}
