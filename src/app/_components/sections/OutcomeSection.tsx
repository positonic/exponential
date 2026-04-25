'use client';

import { Paper, Title, Text, Stack, TextInput, Group, Button } from "@mantine/core";
import { IconBulb } from "@tabler/icons-react";
import { memo } from 'react';

interface OutcomeSectionProps {
  newOutcome: string;
  setNewOutcome: (value: string) => void;
  addOutcome: () => void;
  isLoading: boolean;
}

export const OutcomeSection = memo(({
  newOutcome,
  setNewOutcome,
  addOutcome,
  isLoading
}: OutcomeSectionProps) => {
  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-surface-primary">
      <Stack gap="md">
      <Group justify="space-between">
          {/* <Group>
            <IconBulb className="text-yellow-500" size={24} />
            <Title order={2} className="text-2xl">
              What's the theme of today?
            </Title>
          </Group> */}
        </Group>
        <Group justify="space-between">
          <Group>
            <IconBulb className="text-yellow-500" size={24} />
            <Title order={2} className="text-2xl">
              What would make today great?
            </Title>
          </Group>
        </Group>
        <Text c="dimmed" size="sm">
          What&apos;s one thing you must achieve today?
        </Text>
        <Group>
          <TextInput
            placeholder="Enter what you want to achieve today..."
            value={newOutcome}
            onChange={(e) => setNewOutcome(e.target.value)}
            size="md"
            className="flex-grow bg-surface-secondary"
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                e.metaKey &&
                !isLoading &&
                newOutcome.trim()
              ) {
                e.preventDefault();
                addOutcome();
              }
            }}
          />
          <Button
            onClick={addOutcome}
            loading={isLoading}
            disabled={!newOutcome.trim()}
          >
            Add Outcome
          </Button>
        </Group>
        <Text size="xs" c="dimmed">⌘↵ to add</Text>
      </Stack>
    </Paper>
  );
});

OutcomeSection.displayName = 'OutcomeSection'; 