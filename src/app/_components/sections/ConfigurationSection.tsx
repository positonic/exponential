'use client';

import { Paper, Text, Stack, Checkbox, Group } from "@mantine/core";
import { memo } from 'react';

interface ConfigurationSectionProps {
  doMindset: boolean;
  setDoMindset: (value: boolean) => void;
  doConsider: boolean;
  setDoConsider: (value: boolean) => void;
  doNotToDo: boolean;
  setDoNotToDo: (value: boolean) => void;
  doQuestions: boolean;
  setDoQuestions: (value: boolean) => void;
}

export const ConfigurationSection = memo(({
  doMindset,
  setDoMindset,
  doConsider,
  setDoConsider,
  doNotToDo,
  setDoNotToDo,
  doQuestions,
  setDoQuestions
}: ConfigurationSectionProps) => {
  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-surface-primary">
      <Stack gap="md">
        <Text c="dimmed" size="sm" className="italic">
          Customize your startup routine by enabling or disabling sections to match your needs.
        </Text>
        <Group>
          <Checkbox
            label="Show Mindset Section"
            checked={doMindset}
            onChange={(event) => setDoMindset(event.currentTarget.checked)}
          />
          <Checkbox
            label="Show Consider Section"
            checked={doConsider}
            onChange={(event) => setDoConsider(event.currentTarget.checked)}
          />
          <Checkbox
            label="Show Not-to-Do List"
            checked={doNotToDo}
            onChange={(event) => setDoNotToDo(event.currentTarget.checked)}
          />
          <Checkbox
            label="Show Important Questions"
            checked={doQuestions}
            onChange={(event) => setDoQuestions(event.currentTarget.checked)}
          />
        </Group>
      </Stack>
    </Paper>
  );
});

ConfigurationSection.displayName = 'ConfigurationSection'; 