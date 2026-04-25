'use client';

import { Paper, Title, Text, Stack, TextInput, Checkbox, Group, Button, List } from "@mantine/core";
import { memo } from 'react';

interface NotToDoSectionProps {
  notToDo: string[];
  newNotToDo: string;
  setNewNotToDo: (value: string) => void;
  addNotToDo: () => void;
  completedItems: string[];
  toggleCompletion: (item: string) => void;
}

export const NotToDoSection = memo(({
  notToDo,
  newNotToDo,
  setNewNotToDo,
  addNotToDo,
  completedItems,
  toggleCompletion
}: NotToDoSectionProps) => {
  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-surface-primary">
      <Stack gap="md">
        <Title order={2} className="text-2xl">Not-to-Do List</Title>
        <Text c="dimmed">Things to avoid for a better day</Text>
        <Group>
          <TextInput
            placeholder="Add something to avoid..."
            value={newNotToDo}
            onChange={(e) => setNewNotToDo(e.target.value)}
            size="md"
            className="flex-grow bg-surface-secondary"
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                e.metaKey &&
                newNotToDo.trim()
              ) {
                e.preventDefault();
                addNotToDo();
              }
            }}
          />
          <Button onClick={addNotToDo} disabled={!newNotToDo.trim()}>Add</Button>
        </Group>
        <Text size="xs" c="dimmed">⌘↵ to add</Text>
        <List spacing="sm">
          {notToDo.map((item: string, index: number) => (
            <List.Item key={index}>
              <Checkbox
                label={item}
                checked={completedItems.includes(`not-to-do-${index}`)}
                onChange={() => toggleCompletion(`not-to-do-${index}`)}
                className="my-1"
              />
            </List.Item>
          ))}
        </List>
      </Stack>
    </Paper>
  );
});

NotToDoSection.displayName = 'NotToDoSection'; 