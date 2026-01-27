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
  Tabs,
  ScrollArea,
} from "@mantine/core";
import { IconPlus, IconCheck } from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";

type ExistingAction = RouterOutputs["action"]["getAll"][number];

type DailyPlanAction =
  RouterOutputs["dailyPlan"]["getOrCreateToday"]["plannedActions"][number];

interface AddTaskStepProps {
  tasks: DailyPlanAction[];
  onAddTask: (name: string) => Promise<void>;
  onNext: () => void;
  isLoading: boolean;
  overdueActions?: ExistingAction[];
  todayActions?: ExistingAction[];
}

export function AddTaskStep({
  tasks,
  onAddTask,
  onNext,
  isLoading,
  overdueActions = [],
  todayActions = [],
}: AddTaskStepProps) {
  const [taskName, setTaskName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [addedActionIds, setAddedActionIds] = useState<Set<string>>(new Set());

  const handleAddExistingAction = async (action: ExistingAction) => {
    if (addedActionIds.has(action.id)) return;
    await onAddTask(action.name);
    setAddedActionIds((prev) => new Set([...prev, action.id]));
  };

  const hasExistingActions = overdueActions.length > 0 || todayActions.length > 0;

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

      {/* Middle: Planned for today list */}
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

      {/* Right: Existing Actions Panel */}
      {hasExistingActions && (
        <Stack w={350} gap="md">
          <Title order={4} className="text-text-primary" fw={600}>
            Existing Actions
          </Title>
          <Tabs defaultValue={overdueActions.length > 0 ? "overdue" : "today"} variant="outline">
            <Tabs.List>
              <Tabs.Tab value="overdue">
                Overdue ({overdueActions.length})
              </Tabs.Tab>
              <Tabs.Tab value="today">
                Today ({todayActions.length})
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="overdue" pt="xs">
              <ScrollArea.Autosize mah={300}>
                {overdueActions.length === 0 ? (
                  <Text c="dimmed" size="sm" className="py-2">
                    No overdue actions
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {overdueActions.map((action) => {
                      const isAdded = addedActionIds.has(action.id);
                      return (
                        <Paper
                          key={action.id}
                          p="sm"
                          className={`border border-border-primary transition-colors ${
                            isAdded
                              ? "bg-green-500/10 cursor-default"
                              : "bg-surface-secondary cursor-pointer hover:bg-surface-hover"
                          }`}
                          onClick={() => !isAdded && void handleAddExistingAction(action)}
                        >
                          <Group justify="space-between" wrap="nowrap">
                            <Text
                              size="sm"
                              className={isAdded ? "text-text-muted" : "text-text-primary"}
                              lineClamp={1}
                            >
                              {action.name}
                            </Text>
                            {isAdded ? (
                              <IconCheck size={16} className="text-green-500 flex-shrink-0" />
                            ) : (
                              <IconPlus size={16} className="text-text-muted flex-shrink-0" />
                            )}
                          </Group>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}
              </ScrollArea.Autosize>
            </Tabs.Panel>

            <Tabs.Panel value="today" pt="xs">
              <ScrollArea.Autosize mah={300}>
                {todayActions.length === 0 ? (
                  <Text c="dimmed" size="sm" className="py-2">
                    No actions for today
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {todayActions.map((action) => {
                      const isAdded = addedActionIds.has(action.id);
                      return (
                        <Paper
                          key={action.id}
                          p="sm"
                          className={`border border-border-primary transition-colors ${
                            isAdded
                              ? "bg-green-500/10 cursor-default"
                              : "bg-surface-secondary cursor-pointer hover:bg-surface-hover"
                          }`}
                          onClick={() => !isAdded && void handleAddExistingAction(action)}
                        >
                          <Group justify="space-between" wrap="nowrap">
                            <Text
                              size="sm"
                              className={isAdded ? "text-text-muted" : "text-text-primary"}
                              lineClamp={1}
                            >
                              {action.name}
                            </Text>
                            {isAdded ? (
                              <IconCheck size={16} className="text-green-500 flex-shrink-0" />
                            ) : (
                              <IconPlus size={16} className="text-text-muted flex-shrink-0" />
                            )}
                          </Group>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}
              </ScrollArea.Autosize>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Group>
  );
}
