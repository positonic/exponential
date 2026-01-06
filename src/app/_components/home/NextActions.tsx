'use client';

import { Text, Stack, Group, Checkbox, Badge, ActionIcon } from '@mantine/core';
import { IconPlus, IconFolder } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { CreateActionModal } from '../CreateActionModal';
import { HTMLContent } from '~/app/_components/HTMLContent';

interface NextActionsProps {
  workspaceId?: string;
  limit?: number;
}

export function NextActions({ workspaceId, limit = 5 }: NextActionsProps) {
  const { data: todayActions, isLoading } = api.action.getToday.useQuery({ workspaceId });
  const utils = api.useUtils();

  const updateAction = api.action.update.useMutation({
    onSuccess: () => {
      void utils.action.getToday.invalidate();
    },
  });

  // Filter to show only non-completed actions, limited to top N
  const pendingActions = todayActions
    ?.filter(action => action.status !== 'COMPLETED')
    ?.slice(0, limit) ?? [];

  const handleToggle = (actionId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED';
    updateAction.mutate({
      id: actionId,
      status: newStatus,
    });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-surface-hover rounded w-1/4" />
        <div className="h-8 bg-surface-hover rounded" />
        <div className="h-8 bg-surface-hover rounded" />
      </div>
    );
  }

  if (!todayActions || todayActions.length === 0) {
    return (
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={500} className="text-text-secondary">
            Actions
          </Text>
          <CreateActionModal viewName="today">
            <ActionIcon variant="subtle" size="sm">
              <IconPlus size={14} />
            </ActionIcon>
          </CreateActionModal>
        </Group>
        <Text size="sm" className="text-text-muted">
          No actions for today. Add some tasks to get started.
        </Text>
      </Stack>
    );
  }

  if (pendingActions.length === 0) {
    return (
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={500} className="text-text-secondary">
            Actions
          </Text>
          <CreateActionModal viewName="today">
            <ActionIcon variant="subtle" size="sm">
              <IconPlus size={14} />
            </ActionIcon>
          </CreateActionModal>
        </Group>
        <Text size="sm" className="text-green-500" fw={500}>
          All actions completed! Great work.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={500} className="text-text-secondary">
          Actions ({pendingActions.length} remaining)
        </Text>
        <CreateActionModal viewName="today">
          <ActionIcon variant="subtle" size="sm">
            <IconPlus size={14} />
          </ActionIcon>
        </CreateActionModal>
      </Group>

      <Stack gap="xs">
        {pendingActions.map((action) => (
          <Group
            key={action.id}
            gap="sm"
            className="p-2 rounded-md hover:bg-surface-hover transition-colors"
          >
            <Checkbox
              checked={action.status === 'COMPLETED'}
              onChange={() => handleToggle(action.id, action.status)}
              disabled={updateAction.isPending}
              size="sm"
            />
            <div style={{ flex: 1 }}>
              <Text
                size="sm"
                className={action.status === 'COMPLETED' ? 'text-text-muted line-through' : 'text-text-primary'}
                lineClamp={1}
              >
                <HTMLContent
                  html={action.name}
                  className={action.status === 'COMPLETED' ? 'text-text-muted' : 'text-text-primary'}
                />
              </Text>
              {action.project && (
                <Group gap={4}>
                  <IconFolder size={10} className="text-text-muted" />
                  <Text size="xs" className="text-text-muted">
                    {action.project.name}
                  </Text>
                </Group>
              )}
            </div>
            {action.priority && (
              <Badge
                size="xs"
                color={
                  action.priority === 'LEVEL_1' ? 'red' :
                  action.priority === 'LEVEL_2' ? 'orange' :
                  action.priority === 'QUICK' ? 'blue' : 'gray'
                }
                variant="light"
              >
                {action.priority === 'QUICK' ? 'Quick' : action.priority.replace('LEVEL_', 'P')}
              </Badge>
            )}
          </Group>
        ))}
      </Stack>

      {todayActions.length > limit && (
        <Text size="xs" className="text-text-muted text-center">
          +{todayActions.length - limit} more actions
        </Text>
      )}
    </Stack>
  );
}
