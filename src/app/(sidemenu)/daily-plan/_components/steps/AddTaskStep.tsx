"use client";

import { useState, useRef } from "react";
import {
  Stack,
  Group,
  Title,
  Text,
  TextInput,
  Button,
  Paper,
} from "@mantine/core";
import type { RouterOutputs } from "~/trpc/react";

type DailyPlanAction =
  RouterOutputs["dailyPlan"]["getOrCreateToday"]["plannedActions"][number];

interface AddTaskStepProps {
  tasks: DailyPlanAction[];
  onAddTask: (name: string) => Promise<void>;
  onNext: () => void;
  isLoading: boolean;
}

export function AddTaskStep({
  tasks,
  onAddTask,
  onNext,
  isLoading,
}: AddTaskStepProps) {
  const [taskName, setTaskName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddTask = async () => {
    if (!taskName.trim()) return;
    await onAddTask(taskName.trim());
    setTaskName("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && taskName.trim()) {
      void handleAddTask();
    }
  };

  return (
    <Group align="flex-start" gap={60} wrap="nowrap">
      {/* Left: Prompt + Input */}
      <Stack w={300} gap="lg">
        <div>
          <Title order={3} className="text-text-primary">
            What&apos;s one thing you want to work on today?
          </Title>
          <Text c="dimmed" size="sm" mt="xs">
            Add a task you want to work on.
          </Text>
        </div>

        <Group gap="sm">
          <TextInput
            ref={inputRef}
            autoFocus
            placeholder="Enter task name..."
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            size="md"
            flex={1}
            classNames={{
              input: "bg-surface-secondary border-border-primary",
            }}
          />
          <Button
            onClick={() => void handleAddTask()}
            disabled={!taskName.trim() || isLoading}
            loading={isLoading}
            className="bg-brand-primary hover:bg-brand-primary/90"
          >
            Add
          </Button>
        </Group>

        <Button
          variant="default"
          onClick={onNext}
          disabled={tasks.length === 0}
          className="border-border-primary"
        >
          Next
        </Button>
      </Stack>

      {/* Right: Planned for today list */}
      <Stack w={400} gap="md">
        <Title order={4} className="text-text-primary" fw={600}>
          Planned for today:
        </Title>

        {tasks.length === 0 ? (
          <Text c="dimmed" size="sm">
            No tasks added yet
          </Text>
        ) : (
          <Stack gap="xs">
            {tasks.map((task) => (
              <Paper
                key={task.id}
                p="sm"
                className="bg-surface-secondary border border-border-primary"
              >
                <Text className="text-text-primary">{task.name}</Text>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Group>
  );
}
