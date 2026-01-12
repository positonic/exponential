"use client";

import { Card, Text, Stack, Group, Badge } from "@mantine/core";
import { ActionsDueToday } from "./ActionsDueToday";
import { CalendarEventsToday } from "./CalendarEventsToday";
import { OutcomeAwareness } from "./OutcomeAwareness";

interface TodaySnapshotProps {
  workspaceId?: string;
}

export function TodaySnapshot({ workspaceId }: TodaySnapshotProps) {
  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = today.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="lg">
        <Group justify="space-between">
          <Text fw={600} size="lg" className="text-text-primary">
            Today&apos;s Snapshot
          </Text>
          <Badge variant="light" color="blue" size="sm">
            {dayName}, {dateStr}
          </Badge>
        </Group>

        {/* Three-column grid on desktop, stack on mobile */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ActionsDueToday workspaceId={workspaceId} />
          <CalendarEventsToday />
          <OutcomeAwareness workspaceId={workspaceId} />
        </div>
      </Stack>
    </Card>
  );
}
