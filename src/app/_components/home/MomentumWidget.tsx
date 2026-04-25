'use client';

import { Card, Text, Stack, Group, Progress } from '@mantine/core';
import { IconCheck, IconTarget } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

export function MomentumWidget() {
  const { workspaceId } = useWorkspace();
  const { data: habitStatus, isLoading: habitsLoading } = api.habit.getTodayStatus.useQuery();
  const { data: todayActions, isLoading: actionsLoading } = api.action.getToday.useQuery({ workspaceId: workspaceId ?? undefined });

  const isLoading = habitsLoading || actionsLoading;

  // Calculate habit stats
  const totalHabits = habitStatus?.length ?? 0;
  const completedHabits = habitStatus?.filter(h => h.isCompletedToday)?.length ?? 0;
  const habitProgress = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;

  // Calculate action stats
  const totalActions = todayActions?.length ?? 0;
  const completedActions = todayActions?.filter(a => a.status === 'COMPLETED')?.length ?? 0;
  const actionProgress = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

  if (isLoading) {
    return (
      <Card withBorder radius="md" className="border-border-primary bg-surface-secondary">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-surface-hover rounded w-1/2" />
          <div className="h-8 bg-surface-hover rounded" />
          <div className="h-8 bg-surface-hover rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card withBorder radius="md" className="border-border-primary bg-surface-secondary">
      <Stack gap="md">
        {/* Header */}
        <Text fw={600} size="sm" className="text-text-primary">
          Today&apos;s Momentum
        </Text>

        {/* Habits Progress */}
        <Stack gap={4}>
          <Group justify="space-between">
            <Group gap="xs">
              <IconCheck size={14} className="text-text-muted" />
              <Text size="xs" className="text-text-muted">Habits</Text>
            </Group>
            <Text size="xs" className="text-text-secondary">
              {completedHabits}/{totalHabits}
            </Text>
          </Group>
          <Progress
            value={habitProgress}
            size="sm"
            radius="xl"
            color={habitProgress === 100 ? 'green' : 'blue'}
          />
        </Stack>

        {/* Actions Progress */}
        <Stack gap={4}>
          <Group justify="space-between">
            <Group gap="xs">
              <IconTarget size={14} className="text-text-muted" />
              <Text size="xs" className="text-text-muted">Actions</Text>
            </Group>
            <Text size="xs" className="text-text-secondary">
              {completedActions}/{totalActions}
            </Text>
          </Group>
          <Progress
            value={actionProgress}
            size="sm"
            radius="xl"
            color={actionProgress === 100 ? 'green' : 'violet'}
          />
        </Stack>

        {/* Encouragement message */}
        {habitProgress === 100 && actionProgress === 100 && (
          <Text size="xs" className="text-green-500 text-center" fw={500}>
            Amazing! You&apos;ve completed everything!
          </Text>
        )}
      </Stack>
    </Card>
  );
}
