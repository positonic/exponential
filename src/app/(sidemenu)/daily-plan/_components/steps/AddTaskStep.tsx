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
import { IconPlus } from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";
import { HTMLContent } from "~/app/_components/HTMLContent";

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

  // Filter out actions that have already been added
  const availableOverdueActions = overdueActions.filter(
    (action) => !addedActionIds.has(action.id)
  );
  const availableTodayActions = todayActions.filter(
    (action) => !addedActionIds.has(action.id)
  );

  const hasExistingActions = availableOverdueActions.length > 0 || availableTodayActions.length > 0;

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
            className="bg-brand-primary hover:bg-brand-primary/90 text-text-inverse"
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
                <HTMLContent html={task.name} className="text-text-primary" />
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
          <Tabs defaultValue={availableOverdueActions.length > 0 ? "overdue" : "today"} variant="outline">
            <Tabs.List>
              <Tabs.Tab value="overdue">
                Overdue ({availableOverdueActions.length})
              </Tabs.Tab>
              <Tabs.Tab value="today">
                Today ({availableTodayActions.length})
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="overdue" pt="xs">
              <ScrollArea.Autosize mah={300}>
                {availableOverdueActions.length === 0 ? (
                  <Text c="dimmed" size="sm" className="py-2">
                    No overdue actions
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {availableOverdueActions.map((action) => (
                      <Paper
                        key={action.id}
                        p="sm"
                        className="border border-border-primary transition-colors bg-surface-secondary cursor-pointer hover:bg-surface-hover"
                        onClick={() => void handleAddExistingAction(action)}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Text
                            size="sm"
                            className="text-text-primary"
                            lineClamp={1}
                          >
                            <HTMLContent html={action.name} />
                          </Text>
                          <IconPlus size={16} className="text-text-muted flex-shrink-0" />
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </ScrollArea.Autosize>
            </Tabs.Panel>

            <Tabs.Panel value="today" pt="xs">
              <ScrollArea.Autosize mah={300}>
                {availableTodayActions.length === 0 ? (
                  <Text c="dimmed" size="sm" className="py-2">
                    No actions for today
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {availableTodayActions.map((action) => (
                      <Paper
                        key={action.id}
                        p="sm"
                        className="border border-border-primary transition-colors bg-surface-secondary cursor-pointer hover:bg-surface-hover"
                        onClick={() => void handleAddExistingAction(action)}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Text
                            size="sm"
                            className="text-text-primary"
                            lineClamp={1}
                          >
                            <HTMLContent html={action.name} />
                          </Text>
                          <IconPlus size={16} className="text-text-muted flex-shrink-0" />
                        </Group>
                      </Paper>
                    ))}
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
