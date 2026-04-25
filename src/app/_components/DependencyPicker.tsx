'use client';

import { Button, CloseButton, Group, Loader, Popover, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconLink } from '@tabler/icons-react';
import { useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { api } from '~/trpc/react';

interface DependencyPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  excludeActionId?: string;
  workspaceId?: string;
}

export function DependencyPicker({ selectedIds, onChange, excludeActionId, workspaceId }: DependencyPickerProps) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);

  const { data: searchResults, isLoading } = api.action.searchForDependencies.useQuery(
    {
      query: debouncedSearch,
      workspaceId,
      excludeId: excludeActionId,
      limit: 10,
    },
    { enabled: !!debouncedSearch && debouncedSearch.length >= 2 }
  );

  // Filter out already-selected items from search results
  const filteredResults = searchResults?.filter((r) => !selectedIds.includes(r.id)) ?? [];

  const handleAdd = (id: string) => {
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id]);
    }
    setSearch('');
  };

  const handleRemove = (id: string) => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  // Get names for selected IDs (we fetch them from search to display)
  const { data: selectedActions } = api.action.searchForDependencies.useQuery(
    {
      query: '',
      workspaceId,
      excludeId: excludeActionId,
      limit: 50,
    },
    { enabled: selectedIds.length > 0 && opened }
  );

  const selectedNames = selectedIds.map((id) => {
    const action = selectedActions?.find((a) => a.id === id);
    return { id, name: action?.name ?? 'Loading...' };
  });

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={360}
      shadow="md"
    >
      <Popover.Target>
        <Button
          variant={selectedIds.length > 0 ? 'light' : 'subtle'}
          color={selectedIds.length > 0 ? 'red' : 'gray'}
          size="sm"
          leftSection={<IconLink size={16} />}
          onClick={() => setOpened(true)}
        >
          {selectedIds.length > 0 ? `${selectedIds.length} blocker${selectedIds.length > 1 ? 's' : ''}` : 'Blockers'}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={500}>Blocked by</Text>

          {selectedIds.length > 0 && (
            <Stack gap={4}>
              {selectedNames.map(({ id, name }) => (
                <Group key={id} justify="space-between" className="rounded-md px-2 py-1 bg-surface-secondary">
                  <Text size="xs" lineClamp={1} style={{ flex: 1 }}>
                    {name}
                  </Text>
                  <CloseButton size="xs" onClick={() => handleRemove(id)} />
                </Group>
              ))}
            </Stack>
          )}

          <TextInput
            placeholder="Search actions..."
            size="xs"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
            }}
            autoFocus
          />

          {isLoading && debouncedSearch.length >= 2 && (
            <Group justify="center" p="xs">
              <Loader size="xs" />
            </Group>
          )}

          {filteredResults.length > 0 && (
            <ScrollArea.Autosize mah={160}>
              <Stack gap={2}>
                {filteredResults.map((action) => (
                  <UnstyledButton
                    key={action.id}
                    onClick={() => handleAdd(action.id)}
                    className="rounded-md px-3 py-2 hover:bg-surface-hover transition-colors"
                  >
                    <Text size="sm" lineClamp={1}>
                      {action.name}
                    </Text>
                    {action.project && (
                      <Text size="xs" c="dimmed">
                        {action.project.name}
                      </Text>
                    )}
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}

          {debouncedSearch.length >= 2 && !isLoading && filteredResults.length === 0 && (
            <Text size="xs" c="dimmed" ta="center">
              No matching actions
            </Text>
          )}

          <Group justify="flex-end" gap="xs">
            <Button size="xs" onClick={() => setOpened(false)}>
              Done
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
