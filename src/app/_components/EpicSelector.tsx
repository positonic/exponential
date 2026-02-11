'use client';

import { Button, Group, Loader, Popover, ScrollArea, Stack, Text, UnstyledButton, Badge } from '@mantine/core';
import { IconBolt, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import { CreateEpicModal } from './CreateEpicModal';

interface EpicSelectorProps {
  value: string | null;
  onChange: (epicId: string | null) => void;
  workspaceId?: string;
}

const statusColor: Record<string, string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'yellow',
  DONE: 'green',
  CANCELLED: 'gray',
};

export function EpicSelector({ value, onChange, workspaceId }: EpicSelectorProps) {
  const [opened, setOpened] = useState(false);
  const [createModalOpened, setCreateModalOpened] = useState(false);

  const { workspaceId: contextWorkspaceId } = useWorkspace();
  const effectiveWorkspaceId = workspaceId ?? contextWorkspaceId ?? undefined;

  const utils = api.useUtils();

  const { data: epics, isLoading } = api.epic.list.useQuery(
    { workspaceId: effectiveWorkspaceId ?? '' },
    { enabled: !!effectiveWorkspaceId }
  );

  const selectedEpic = epics?.find((e) => e.id === value);

  return (
    <>
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        width={320}
        shadow="md"
      >
        <Popover.Target>
          <Button
            variant={value ? 'light' : 'subtle'}
            color={value ? 'violet' : 'gray'}
            size="sm"
            leftSection={<IconBolt size={16} />}
            onClick={() => setOpened(true)}
          >
            {selectedEpic ? selectedEpic.name : 'Epic'}
          </Button>
        </Popover.Target>

        <Popover.Dropdown>
          <Stack gap="sm">
            <Text size="sm" fw={500}>Select epic</Text>

            {isLoading ? (
              <Group justify="center" p="md">
                <Loader size="sm" />
              </Group>
            ) : epics && epics.length > 0 ? (
              <ScrollArea.Autosize mah={200}>
                <Stack gap={4}>
                  {epics.map((epic) => (
                    <UnstyledButton
                      key={epic.id}
                      onClick={() => {
                        onChange(epic.id === value ? null : epic.id);
                        setOpened(false);
                      }}
                      className={`rounded-md px-3 py-2 transition-colors ${
                        epic.id === value
                          ? 'bg-surface-hover'
                          : 'hover:bg-surface-hover'
                      }`}
                    >
                      <Group justify="space-between">
                        <Text size="sm" fw={epic.id === value ? 600 : 400}>
                          {epic.name}
                        </Text>
                        <Group gap="xs">
                          <Badge
                            size="xs"
                            variant="light"
                            color={statusColor[epic.status] ?? 'gray'}
                          >
                            {epic.status.replace('_', ' ')}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {epic._count.actions}
                          </Text>
                        </Group>
                      </Group>
                    </UnstyledButton>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            ) : (
              <Text size="sm" c="dimmed" ta="center">
                No epics yet
              </Text>
            )}

            {effectiveWorkspaceId && (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconPlus size={14} />}
                onClick={() => {
                  setOpened(false);
                  setCreateModalOpened(true);
                }}
                fullWidth
              >
                New Epic
              </Button>
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

      <CreateEpicModal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        workspaceId={effectiveWorkspaceId}
        onCreated={(epic) => {
          onChange(epic.id);
          void utils.epic.list.invalidate();
        }}
      />
    </>
  );
}
