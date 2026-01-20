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
  TextInput,
  ActionIcon,
  Drawer,
} from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import {
  IconPlus,
  IconCalendar,
  IconTrash,
  IconGripVertical,
  IconBrandNotion,
} from "@tabler/icons-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

interface SortableTaskCardProps {
  task: DailyPlanAction;
  onRemove: (id: string) => void;
}

function SortableTaskCard({ task, onRemove }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      p="md"
      className="bg-surface-secondary border border-border-primary"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" flex={1}>
          <ActionIcon
            variant="subtle"
            size="sm"
            className="cursor-grab text-text-muted"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={16} />
          </ActionIcon>

          <Stack gap={2} flex={1}>
            {task.scheduledStart && (
              <Text size="xs" c="dimmed">
                {new Date(task.scheduledStart).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            )}
            <Text fw={500} className="text-text-primary">
              {task.name}
            </Text>
            {task.source !== "manual" && (
              <Badge size="xs" variant="light" color="blue">
                #{task.source}
              </Badge>
            )}
          </Stack>
        </Group>

        <Group gap="xs">
          <Badge variant="light" color="gray" size="sm">
            {formatDuration(task.duration)}
          </Badge>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="red"
            onClick={() => onRemove(task.id)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}

interface FillDayStepProps {
  dailyPlan: DailyPlan;
  tasks: DailyPlanAction[];
  totalMinutes: number;
  onAddTask: (name: string, duration?: number) => Promise<void>;
  onRemoveTask: (id: string) => Promise<void>;
  onUpdateTask: (
    taskId: string,
    updates: { duration?: number; scheduledStart?: Date | null; scheduledEnd?: Date | null }
  ) => Promise<void>;
  onReorderTasks: (taskIds: string[]) => Promise<void>;
  onUpdatePlan: (updates: { shutdownTime?: string }) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function FillDayStep({
  dailyPlan,
  tasks,
  totalMinutes,
  onAddTask,
  onRemoveTask,
  onReorderTasks,
  onUpdatePlan,
  onNext,
  onBack,
}: FillDayStepProps) {
  const [newTaskName, setNewTaskName] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [shutdownTime, setShutdownTime] = useState(
    dailyPlan.shutdownTime ?? "17:00"
  );
  const [notionPanelOpen, setNotionPanelOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      const reorderedIds = arrayMove(
        tasks.map((t) => t.id),
        oldIndex,
        newIndex
      );
      void onReorderTasks(reorderedIds);
    }
  };

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
        <Stack w={280} gap="md">
          <div>
            <Title order={3} className="text-text-primary">
              Fill in your day
            </Title>
            <Text c="dimmed" size="sm" mt="xs">
              Create new tasks, or pull in work from your existing tools.
            </Text>
          </div>

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
            <Group gap="sm">
              <TimeInput
                value={shutdownTime}
                onChange={(e) => handleShutdownTimeChange(e.target.value)}
                size="sm"
                w={100}
              />
              <Button
                size="xs"
                variant="light"
                leftSection={<IconCalendar size={14} />}
              >
                Add to calendar
              </Button>
            </Group>
          </Paper>

          {/* Integration Buttons */}
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

        {/* Center Panel: Task List */}
        <Stack flex={1} gap="md" maw={500}>
          <Group justify="space-between" align="center">
            <div>
              <Title order={4} className="text-text-primary">
                Today
              </Title>
              <Text size="sm" c="dimmed">
                Fill in your work for today
              </Text>
            </div>
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
          >
            Add task
          </Button>

          {/* New Task Input */}
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

          {/* Sortable Task List */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap="sm">
                {tasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onRemove={(id) => void onRemoveTask(id)}
                  />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>

          {tasks.length === 0 && (
            <Text c="dimmed" ta="center" py="xl">
              No tasks yet. Add some tasks or import from your integrations.
            </Text>
          )}
        </Stack>

        {/* Right Panel: Calendar Preview (placeholder) */}
        <Stack w={300} gap="md" className="hidden lg:flex">
          <Paper
            p="md"
            className="bg-surface-secondary border border-border-primary"
            h={400}
          >
            <Text fw={600} size="sm" className="text-text-primary" mb="md">
              Calendar
            </Text>
            <Text size="sm" c="dimmed">
              Calendar preview will show your scheduled tasks and events here.
            </Text>
          </Paper>
        </Stack>
      </Group>

      {/* Notion Integration Drawer */}
      <Drawer
        opened={notionPanelOpen}
        onClose={() => setNotionPanelOpen(false)}
        title="Notion Integration"
        position="right"
        size="md"
      >
        <Stack gap="md">
          <Text c="dimmed">
            Plan your day using your Notion pages. Connect your Notion account
            to browse your databases and drag tasks into your daily plan.
          </Text>
          <Button variant="filled">Connect Notion</Button>
          <Text size="sm" c="dimmed">
            Integration panel coming soon...
          </Text>
        </Stack>
      </Drawer>
    </>
  );
}
