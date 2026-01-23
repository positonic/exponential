"use client";

import { Stack, Group, Title, Text, Button, Paper } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { TimeGrid } from "../TimeGrid";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

interface ScheduleStepProps {
  dailyPlan: DailyPlan;
  tasks: DailyPlanAction[];
  planDate: Date;
  workHoursStart: string;
  workHoursEnd: string;
  onUpdateTask: (
    taskId: string,
    updates: { scheduledStart?: Date | null; scheduledEnd?: Date | null }
  ) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function ScheduleStep({
  tasks,
  planDate,
  workHoursStart,
  workHoursEnd,
  onUpdateTask,
  onNext,
  onBack,
}: ScheduleStepProps) {
  // Get calendar events for the plan date
  const timeMin = new Date(planDate);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(planDate);
  timeMax.setHours(23, 59, 59, 999);

  const { data: connectionStatus } = api.calendar.getConnectionStatus.useQuery();
  const { data: calendarEvents } = api.calendar.getEvents.useQuery(
    { timeMin, timeMax, maxResults: 50 },
    { enabled: connectionStatus?.isConnected }
  );

  const handleScheduleTask = async (
    taskId: string,
    scheduledStart: Date,
    scheduledEnd: Date
  ) => {
    await onUpdateTask(taskId, { scheduledStart, scheduledEnd });
  };

  return (
    <Group align="flex-start" gap="xl" wrap="nowrap">
      {/* Left Panel: Instructions */}
      <Stack w={280} gap="lg">
        <div>
          <Title order={3} className="text-text-primary">
            Schedule your tasks
          </Title>
          <Text c="dimmed" size="sm" mt="xs">
            Drag tasks to the timeline to time-block your day, or skip this step
            to work through your list flexibly.
          </Text>
        </div>

        <Paper
          p="md"
          className="bg-surface-secondary border border-border-primary"
        >
          <Group gap="xs" mb="sm">
            <IconClock size={16} className="text-text-muted" />
            <Text fw={600} size="sm" className="text-text-primary">
              Quick Tips
            </Text>
          </Group>
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              • Drag tasks to specific time slots
            </Text>
            <Text size="xs" c="dimmed">
              • Tasks auto-calculate end time
            </Text>
            <Text size="xs" c="dimmed">
              • Gray slots show calendar events
            </Text>
            <Text size="xs" c="dimmed">
              • Leave unscheduled for flexible work
            </Text>
          </Stack>
        </Paper>

        <Stack gap="xs">
          <Button variant="default" onClick={onNext} className="border-border-primary">
            Next
          </Button>
          <Button variant="subtle" onClick={onBack}>
            Back
          </Button>
        </Stack>
      </Stack>

      {/* Right: Time Grid */}
      <Stack flex={1}>
        <TimeGrid
          planDate={planDate}
          tasks={tasks}
          calendarEvents={calendarEvents ?? []}
          onScheduleTask={handleScheduleTask}
          workHoursStart={workHoursStart}
          workHoursEnd={workHoursEnd}
        />
      </Stack>
    </Group>
  );
}
