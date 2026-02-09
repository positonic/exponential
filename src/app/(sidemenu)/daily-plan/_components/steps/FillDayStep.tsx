"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Stack,
  Group,
  Title,
  Text,
  Button,
  Paper,
  Badge,
  TextInput,
} from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import {
  IconBrandNotion,
  IconCalendarEvent,
} from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";
import { WorkloadTimeline } from "../WorkloadTimeline";
import { DeferColumnView } from "../DeferColumnView";
import { CalendarEventImporter } from "../CalendarEventImporter";
import { NotionTaskImporter } from "../NotionTaskImporter";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

interface FillDayStepProps {
  dailyPlan: DailyPlan;
  tasks: DailyPlanAction[];
  totalMinutes: number;
  planDate: Date;
  workHoursStart: string;
  workHoursEnd: string;
  onAddTask: (name: string, duration?: number) => Promise<void>;
  onRemoveTask: (id: string) => Promise<void>;
  onDeferTask: (taskId: string, newDate: Date) => Promise<void>;
  onUpdateTask: (
    taskId: string,
    updates: { duration?: number; scheduledStart?: Date | null; scheduledEnd?: Date | null }
  ) => Promise<void>;
  onReorderTasks: (taskIds: string[]) => Promise<void>;
  onUpdatePlan: (updates: { shutdownTime?: string }) => Promise<void>;
  onRefetch: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function FillDayStep({
  dailyPlan,
  tasks,
  totalMinutes,
  planDate,
  workHoursStart,
  workHoursEnd: _workHoursEnd,
  onAddTask,
  onRemoveTask,
  onDeferTask,
  onReorderTasks,
  onUpdatePlan,
  onRefetch,
  onNext,
  onBack,
}: FillDayStepProps) {
  const [newTaskName, setNewTaskName] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [shutdownTime, setShutdownTime] = useState(
    dailyPlan.shutdownTime ?? "17:00"
  );
  const [notionPanelOpen, setNotionPanelOpen] = useState(false);
  const [calendarPanelOpen, setCalendarPanelOpen] = useState(false);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in an input
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Escape to close the add task input
        if (event.key === "Escape" && showAddTask) {
          setShowAddTask(false);
          setNewTaskName("");
        }
        return;
      }

      // 'A' to open add task
      if (event.key === "a" || event.key === "A") {
        event.preventDefault();
        setShowAddTask(true);
      }

      // Escape to close add task
      if (event.key === "Escape" && showAddTask) {
        setShowAddTask(false);
        setNewTaskName("");
      }
    },
    [showAddTask]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleAddTask = async () => {
    if (!newTaskName.trim()) return;
    await onAddTask(newTaskName.trim(), 60);
    setNewTaskName("");
    setShowAddTask(false);
  };

  const handleShutdownTimeChange = (value: string) => {
    setShutdownTime(value);
    void onUpdatePlan({ shutdownTime: value });
  };

  return (
    <>
      <Group align="flex-start" gap="xl" wrap="nowrap">
        {/* Left Panel: Settings + Integration Buttons */}
        <Stack w={320} gap="md">
          <div>
            <Title order={3} className="text-text-primary">
              Fill in your day
            </Title>
            <Text c="dimmed" size="sm" mt="xs">
              Create new tasks, or pull in work from your existing tools.
            </Text>
          </div>

          {/* Workload Timeline */}
          <WorkloadTimeline
            totalPlannedMinutes={totalMinutes}
            workStartTime={workHoursStart}
            preferredShutdownTime={shutdownTime}
            planDate={planDate}
          />

          {/* Shutdown Time */}
          <Paper
            p="md"
            className="bg-surface-secondary border border-border-primary"
          >
            <Text fw={600} size="sm" className="text-text-primary">
              Shutdown time
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              What time would you like to wrap up work by?
            </Text>
            <TimeInput
              value={shutdownTime}
              onChange={(e) => handleShutdownTimeChange(e.target.value)}
              size="sm"
              w={100}
            />
          </Paper>

          {/* Integration Buttons */}
          <Button
            variant="default"
            leftSection={<IconCalendarEvent size={18} />}
            fullWidth
            onClick={() => setCalendarPanelOpen(true)}
            className="border-border-primary"
          >
            Import from Calendar
          </Button>

          <Button
            variant="default"
            leftSection={<IconBrandNotion size={18} />}
            fullWidth
            onClick={() => setNotionPanelOpen(true)}
            className="border-border-primary"
          >
            Add tasks from Notion
          </Button>

          <Button variant="default" onClick={onNext} className="border-border-primary">
            Next
          </Button>

          <Button variant="subtle" onClick={onBack}>
            Back
          </Button>
        </Stack>

        {/* Center/Right Panel: Multi-Column Defer View */}
        <Stack flex={1} gap="md">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4} className="text-text-primary">
                What can wait?
              </Title>
              <Text size="sm" c="dimmed">
                Drag tasks to defer them to a later day
              </Text>
            </div>
            <Badge variant="light" color="gray">
              Total: {formatDuration(totalMinutes)}
            </Badge>
          </Group>

          {/* New Task Input (shown as overlay/modal) */}
          {showAddTask && (
            <Paper
              p="sm"
              className="bg-surface-secondary border border-border-primary"
            >
              <Group>
                <TextInput
                  placeholder="Task name..."
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleAddTask()}
                  flex={1}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => void handleAddTask()}
                  disabled={!newTaskName.trim()}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => setShowAddTask(false)}
                >
                  Cancel
                </Button>
              </Group>
            </Paper>
          )}

          {/* Multi-Column Defer View */}
          <DeferColumnView
            tasks={tasks}
            planDate={planDate}
            onRemoveTask={onRemoveTask}
            onDeferTask={onDeferTask}
            onReorderTasks={onReorderTasks}
            onShowAddTask={() => setShowAddTask(true)}
          />
        </Stack>
      </Group>

      {/* Calendar Import Drawer */}
      <CalendarEventImporter
        opened={calendarPanelOpen}
        onClose={() => setCalendarPanelOpen(false)}
        planDate={planDate}
        dailyPlanId={dailyPlan.id}
        onImported={onRefetch}
      />

      {/* Notion Task Importer Modal */}
      <NotionTaskImporter
        opened={notionPanelOpen}
        onClose={() => setNotionPanelOpen(false)}
        planDate={planDate}
        dailyPlanId={dailyPlan.id}
        onImported={onRefetch}
      />
    </>
  );
}
