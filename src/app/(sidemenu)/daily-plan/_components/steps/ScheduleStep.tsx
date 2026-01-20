"use client";

import {
  Stack,
  Group,
  Title,
  Text,
  Button,
  Paper,
  Badge,
} from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ScheduleStepProps {
  dailyPlan: DailyPlan;
  tasks: DailyPlanAction[];
  onUpdateTask: (
    taskId: string,
    updates: { scheduledStart?: Date | null; scheduledEnd?: Date | null }
  ) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function ScheduleStep({
  tasks,
  onNext,
  onBack,
}: ScheduleStepProps) {
  const scheduledTasks = tasks.filter((t) => t.scheduledStart);
  const unscheduledTasks = tasks.filter((t) => !t.scheduledStart);

  return (
    <Group align="flex-start" gap="xl" wrap="nowrap">
      {/* Left Panel: Instructions */}
      <Stack w={280} gap="lg">
        <div>
          <Title order={3} className="text-text-primary">
            Schedule your tasks
          </Title>
          <Text c="dimmed" size="sm" mt="xs">
            Drag tasks to the calendar to time-block your day, or skip this step
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
              - Drag tasks to specific time slots
            </Text>
            <Text size="xs" c="dimmed">
              - Tasks auto-calculate end time based on duration
            </Text>
            <Text size="xs" c="dimmed">
              - Leave unscheduled for flexible work
            </Text>
          </Stack>
        </Paper>

        <Group>
          <Button variant="default" onClick={onBack} className="border-border-primary">
            Back
          </Button>
          <Button variant="default" onClick={onNext} className="border-border-primary">
            Next
          </Button>
        </Group>
      </Stack>

      {/* Center: Unscheduled Tasks */}
      <Stack flex={1} gap="md" maw={400}>
        <Title order={4} className="text-text-primary">
          Unscheduled Tasks
        </Title>
        <Text size="sm" c="dimmed">
          These tasks don&apos;t have a specific time yet.
        </Text>

        <Stack gap="sm">
          {unscheduledTasks.map((task) => (
            <Paper
              key={task.id}
              p="md"
              className="bg-surface-secondary border border-border-primary cursor-grab"
            >
              <Group justify="space-between">
                <Text fw={500} className="text-text-primary">
                  {task.name}
                </Text>
                <Badge variant="light" color="gray" size="sm">
                  {formatDuration(task.duration)}
                </Badge>
              </Group>
            </Paper>
          ))}

          {unscheduledTasks.length === 0 && (
            <Text c="dimmed" ta="center" py="md">
              All tasks are scheduled!
            </Text>
          )}
        </Stack>
      </Stack>

      {/* Right: Calendar / Scheduled Tasks */}
      <Stack w={350} gap="md">
        <Title order={4} className="text-text-primary">
          Scheduled
        </Title>

        <Paper
          p="md"
          className="bg-surface-secondary border border-border-primary"
          mih={400}
        >
          {scheduledTasks.length > 0 ? (
            <Stack gap="sm">
              {scheduledTasks
                .sort(
                  (a, b) =>
                    new Date(a.scheduledStart!).getTime() -
                    new Date(b.scheduledStart!).getTime()
                )
                .map((task) => (
                  <Paper
                    key={task.id}
                    p="sm"
                    className="bg-brand-primary/10 border border-brand-primary/30"
                  >
                    <Group justify="space-between" mb="xs">
                      <Text size="xs" fw={500} className="text-brand-primary">
                        {formatTime(new Date(task.scheduledStart!))}
                        {task.scheduledEnd &&
                          ` - ${formatTime(new Date(task.scheduledEnd))}`}
                      </Text>
                      <Badge size="xs" variant="light">
                        {formatDuration(task.duration)}
                      </Badge>
                    </Group>
                    <Text size="sm" className="text-text-primary">
                      {task.name}
                    </Text>
                  </Paper>
                ))}
            </Stack>
          ) : (
            <Stack align="center" justify="center" h={300}>
              <IconClock size={32} className="text-text-muted" />
              <Text c="dimmed" ta="center">
                Drag tasks here to schedule them, or click Next to skip
                time-blocking.
              </Text>
            </Stack>
          )}
        </Paper>

        <Text size="xs" c="dimmed" ta="center">
          Full calendar integration coming soon
        </Text>
      </Stack>
    </Group>
  );
}
