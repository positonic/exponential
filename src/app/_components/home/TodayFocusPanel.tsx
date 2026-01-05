'use client';

import { Card, Text, Stack, Group, Badge } from '@mantine/core';
import { HabitsDueToday } from './HabitsDueToday';
import { OutcomesByGoal } from './OutcomesByGoal';
import { NextActions } from './NextActions';

interface TodayFocusPanelProps {
  workspaceId?: string;
}

export function TodayFocusPanel({ workspaceId }: TodayFocusPanelProps) {
  return (
    <Card withBorder radius="md" className="border-border-primary bg-surface-secondary">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <Text fw={600} size="lg" className="text-text-primary">
            Today&apos;s Focus
          </Text>
          <Badge variant="light" color="blue" size="sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </Badge>
        </Group>

        {/* Habits Section */}
        <div>
          <HabitsDueToday />
        </div>

        {/* Outcomes by Goal Section */}
        <div>
          <OutcomesByGoal workspaceId={workspaceId} />
        </div>

        {/* Next Actions Section */}
        <div>
          <NextActions workspaceId={workspaceId} />
        </div>
      </Stack>
    </Card>
  );
}
