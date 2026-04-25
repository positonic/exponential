"use client";

import { useState } from "react";
import {
  Stack,
  Group,
  Title,
  Text,
  Button,
  Paper,
  Badge,
  Progress,
  Select,
  TextInput,
  ActionIcon,
} from "@mantine/core";
import { IconPlus, IconClock } from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";
import { HTMLContent } from "~/app/_components/HTMLContent";

type DailyPlanAction =
  RouterOutputs["dailyPlan"]["getOrCreateToday"]["plannedActions"][number];

const DURATION_OPTIONS = [
  { value: "5", label: "5 min" },
  { value: "10", label: "10 min" },
  { value: "15", label: "15 min" },
  { value: "20", label: "20 min" },
  { value: "25", label: "25 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hr" },
  { value: "90", label: "1.5 hr" },
  { value: "120", label: "2 hr" },
  { value: "180", label: "3 hr" },
  { value: "240", label: "4 hr" },
];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

interface EstimateTimingStepProps {
  tasks: DailyPlanAction[];
  totalMinutes: number;
  onUpdateTask: (
    taskId: string,
    updates: { duration?: number }
  ) => Promise<void>;
  onAddTask: (name: string, duration?: number) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
  isLoading: boolean;
}

export function EstimateTimingStep({
  tasks,
  totalMinutes,
  onUpdateTask,
  onAddTask,
  onNext,
  onBack,
  isLoading,
}: EstimateTimingStepProps) {
  const [newTaskName, setNewTaskName] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);

  const handleDurationChange = async (taskId: string, value: string | null) => {
    if (!value) return;
    await onUpdateTask(taskId, { duration: parseInt(value, 10) });
  };

  const handleAddTask = async () => {
    if (!newTaskName.trim()) return;
    await onAddTask(newTaskName.trim(), 60);
    setNewTaskName("");
    setShowAddTask(false);
  };

  // 8 hours = 480 minutes as target
  const progressPercent = Math.min((totalMinutes / 480) * 100, 100);

  return (
    <Group align="flex-start" gap={60} wrap="nowrap">
      {/* Left: Total Time + Controls */}
      <Stack w={280} gap="lg">
        <div>
          <Title order={3} className="text-text-primary">
            How much time do you plan to spend on that?
          </Title>
          <Text c="dimmed" size="sm" mt="xs">
            Set the time you plan to work on each task.
          </Text>
        </div>

        <Paper p="md" className="bg-surface-secondary border border-border-primary">
          <Text fw={600} size="sm" className="text-text-primary" mb="sm">
            Total planned time
          </Text>
          <Badge size="lg" color="green" mb="md">
            {formatDuration(totalMinutes)}
          </Badge>
          <Progress value={progressPercent} size="lg" color="green" mb="xs" />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              0 hr
            </Text>
            <Text size="xs" c="dimmed">
              8 hr
            </Text>
          </Group>
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

      {/* Right: Task List with Duration */}
      <Stack flex={1} gap="md" maw={500}>
        <Group justify="space-between" align="center">
          <Title order={4} className="text-text-primary">
            Today
          </Title>
          <Badge variant="light" color="gray">
            Work: {formatDuration(totalMinutes)}
          </Badge>
        </Group>

        {/* Add Task Button */}
        <Button
          variant="subtle"
          leftSection={<IconPlus size={16} />}
          onClick={() => setShowAddTask(true)}
          className="justify-start text-text-secondary"
          disabled={isLoading}
        >
          Add task
        </Button>

        {/* New Task Input */}
        {showAddTask && (
          <Paper p="sm" className="bg-surface-secondary border border-border-primary">
            <Group>
              <TextInput
                placeholder="Task name..."
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleAddTask()}
                flex={1}
                autoFocus
              />
              <Button size="sm" onClick={() => void handleAddTask()} disabled={!newTaskName.trim()}>
                Add
              </Button>
              <Button size="sm" variant="subtle" onClick={() => setShowAddTask(false)}>
                Cancel
              </Button>
            </Group>
          </Paper>
        )}

        {/* Task Cards */}
        <Stack gap="sm">
          {tasks.map((task) => (
            <Paper
              key={task.id}
              p="md"
              className="bg-surface-secondary border border-border-primary"
            >
              <Group justify="space-between" align="flex-start">
                <Stack gap={4} flex={1}>
                  <Text fw={500} className="text-text-primary" component="div">
                    <HTMLContent html={task.name} />
                  </Text>
                  {task.source !== "manual" && (
                    <Badge size="xs" variant="light" color="blue">
                      #{task.source}
                    </Badge>
                  )}
                </Stack>

                <Group gap="xs" align="center">
                  <ActionIcon variant="subtle" size="sm" disabled>
                    <IconClock size={14} />
                  </ActionIcon>
                  <Select
                    data={DURATION_OPTIONS}
                    value={task.duration.toString()}
                    onChange={(value) => void handleDurationChange(task.id, value)}
                    size="xs"
                    w={90}
                    disabled={isLoading}
                    classNames={{
                      input: "bg-surface-primary border-border-primary",
                    }}
                  />
                </Group>
              </Group>

              <Group justify="space-between" mt="sm">
                <Text size="xs" c="dimmed">
                  ACTUAL: --:--
                </Text>
                <Text size="xs" c="dimmed">
                  PLANNED: {formatDuration(task.duration)}
                </Text>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Group>
  );
}
