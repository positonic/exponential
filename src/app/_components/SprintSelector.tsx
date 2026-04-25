'use client';

import { Button, Group, Loader, Popover, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconLayoutList } from '@tabler/icons-react';
import { useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

interface SprintSelectorProps {
  value: string | null;
  onChange: (listId: string | null) => void;
  workspaceId?: string;
}

export function SprintSelector({ value, onChange, workspaceId }: SprintSelectorProps) {
  const [opened, setOpened] = useState(false);

  const { workspaceId: contextWorkspaceId } = useWorkspace();
  const effectiveWorkspaceId = workspaceId ?? contextWorkspaceId ?? undefined;

  const { data: lists, isLoading } = api.list.list.useQuery(
    { workspaceId: effectiveWorkspaceId ?? '' },
    { enabled: !!effectiveWorkspaceId }
  );

  const sprintLists = lists?.filter((l) => l.listType === 'SPRINT') ?? [];
  const selectedSprint = sprintLists.find((s) => s.id === value);

  const formatDateRange = (start: Date | null, end: Date | null) => {
    if (!start && !end) return '';
    const fmt = (d: Date) =>
      new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (start && end) return `${fmt(start)} - ${fmt(end)}`;
    if (start) return `From ${fmt(start)}`;
    return `Until ${fmt(end!)}`;
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={280}
      shadow="md"
    >
      <Popover.Target>
        <Button
          variant={value ? 'light' : 'subtle'}
          color={value ? 'teal' : 'gray'}
          size="sm"
          leftSection={<IconLayoutList size={16} />}
          onClick={() => setOpened(true)}
        >
          {selectedSprint ? selectedSprint.name : 'Sprint'}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={500}>Select sprint</Text>

          {isLoading ? (
            <Group justify="center" p="md">
              <Loader size="sm" />
            </Group>
          ) : sprintLists.length > 0 ? (
            <ScrollArea.Autosize mah={200}>
              <Stack gap={4}>
                {sprintLists.map((sprint) => (
                  <UnstyledButton
                    key={sprint.id}
                    onClick={() => {
                      onChange(sprint.id === value ? null : sprint.id);
                      setOpened(false);
                    }}
                    className={`rounded-md px-3 py-2 transition-colors ${
                      sprint.id === value
                        ? 'bg-surface-hover'
                        : 'hover:bg-surface-hover'
                    }`}
                  >
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" fw={sprint.id === value ? 600 : 400}>
                          {sprint.name}
                        </Text>
                        {(sprint.startDate ?? sprint.endDate) && (
                          <Text size="xs" c="dimmed">
                            {formatDateRange(sprint.startDate, sprint.endDate)}
                          </Text>
                        )}
                      </div>
                      <Text size="xs" c="dimmed" tt="capitalize">
                        {sprint.status.toLowerCase()}
                      </Text>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          ) : (
            <Text size="sm" c="dimmed" ta="center">
              No sprints yet
            </Text>
          )}

          <Group justify="flex-end" gap="xs">
            {value && (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  onChange(null);
                  setOpened(false);
                }}
              >
                Clear
              </Button>
            )}
            <Button size="xs" onClick={() => setOpened(false)}>
              Done
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
