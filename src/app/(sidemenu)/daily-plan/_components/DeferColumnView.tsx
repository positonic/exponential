"use client";

import { useState } from "react";
import {
  Stack,
  Group,
  Text,
  Button,
  Paper,
  Badge,
  ActionIcon,
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconGripVertical,
  IconCalendar,
} from "@tabler/icons-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, addDays, nextMonday, startOfDay } from "date-fns";
import type { RouterOutputs } from "~/trpc/react";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

type ColumnId = "today" | "tomorrow" | "next-week";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

interface DraggableTaskCardProps {
  task: DailyPlanAction;
  onRemove: (id: string) => void;
}

function DraggableTaskCard({ task, onRemove }: DraggableTaskCardProps) {
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
      p="sm"
      className="bg-surface-secondary border border-border-primary"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" flex={1}>
          <ActionIcon
            variant="subtle"
            size="sm"
            className="cursor-grab text-text-muted"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={14} />
          </ActionIcon>

          <Stack gap={2} flex={1}>
            <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
              {task.name}
            </Text>
            {task.source !== "manual" && (
              <Group gap={4}>
                {task.source === "calendar" && <IconCalendar size={12} className="text-text-muted" />}
                <Badge size="xs" variant="light" color="blue">
                  {task.source}
                </Badge>
              </Group>
            )}
          </Stack>
        </Group>

        <Group gap={4}>
          <Badge variant="light" color="gray" size="xs">
            {formatDuration(task.duration)}
          </Badge>
          <ActionIcon
            variant="subtle"
            size="xs"
            color="red"
            onClick={() => onRemove(task.id)}
          >
            <IconTrash size={12} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}

interface TaskCardOverlayProps {
  task: DailyPlanAction;
}

function TaskCardOverlay({ task }: TaskCardOverlayProps) {
  return (
    <Paper
      p="sm"
      className="bg-surface-secondary border-2 border-brand-primary shadow-lg"
      style={{ width: 280 }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} flex={1}>
          <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
            {task.name}
          </Text>
        </Stack>
        <Badge variant="light" color="gray" size="xs">
          {formatDuration(task.duration)}
        </Badge>
      </Group>
    </Paper>
  );
}

interface DroppableColumnProps {
  id: ColumnId;
  title: string;
  subtitle: string;
  tasks: DailyPlanAction[];
  totalMinutes: number;
  onRemoveTask: (id: string) => void;
  onAddTask?: () => void;
  isPrimary?: boolean;
}

function DroppableColumn({
  id,
  title,
  subtitle,
  tasks,
  totalMinutes,
  onRemoveTask,
  onAddTask,
  isPrimary = false,
}: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <Stack
      ref={setNodeRef}
      gap="sm"
      className={`min-h-[300px] rounded-lg p-3 transition-colors ${
        isOver
          ? "bg-brand-primary/10 border-2 border-dashed border-brand-primary"
          : isPrimary
          ? "bg-surface-secondary border border-border-primary"
          : "bg-surface-tertiary/50 border border-border-secondary"
      }`}
      flex={1}
    >
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600} size="sm" className="text-text-primary">
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        </div>
        <Badge variant="light" color={isPrimary ? "blue" : "gray"} size="sm">
          {formatDuration(totalMinutes)}
        </Badge>
      </Group>

      {onAddTask && (
        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={onAddTask}
          className="justify-start text-text-secondary"
        >
          Add task
        </Button>
      )}

      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <Stack gap="xs">
          {tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              task={task}
              onRemove={onRemoveTask}
            />
          ))}
        </Stack>
      </SortableContext>

      {tasks.length === 0 && (
        <Text size="xs" c="dimmed" ta="center" py="md" className="italic">
          {isPrimary ? "Add tasks above" : "Drag tasks here to defer"}
        </Text>
      )}
    </Stack>
  );
}

interface DeferColumnViewProps {
  tasks: DailyPlanAction[];
  planDate: Date;
  onRemoveTask: (id: string) => Promise<void>;
  onDeferTask: (taskId: string, newDate: Date) => Promise<void>;
  onReorderTasks: (taskIds: string[]) => Promise<void>;
  onShowAddTask: () => void;
}

export function DeferColumnView({
  tasks,
  planDate,
  onRemoveTask,
  onDeferTask,
  onReorderTasks,
  onShowAddTask,
}: DeferColumnViewProps) {
  const [activeTask, setActiveTask] = useState<DailyPlanAction | null>(null);

  // Calculate dates
  const today = startOfDay(planDate);
  const tomorrow = addDays(today, 1);
  const nextWeek = nextMonday(today);

  // Track local defer state (for optimistic UI during drag)
  const [deferredTasks, setDeferredTasks] = useState<Record<string, ColumnId>>({});

  const getTaskColumn = (task: DailyPlanAction): ColumnId => {
    // First check local state (for pending/optimistic drags)
    if (deferredTasks[task.id]) {
      return deferredTasks[task.id];
    }

    // Then check the task's actual scheduledStart from the database
    if (task.scheduledStart) {
      const taskDate = startOfDay(new Date(task.scheduledStart));
      if (taskDate.getTime() === today.getTime()) return "today";
      if (taskDate.getTime() === tomorrow.getTime()) return "tomorrow";
      if (taskDate >= nextWeek) return "next-week";
    }

    return "today"; // Default to today for unscheduled tasks
  };

  const todayTasks = tasks.filter((t) => getTaskColumn(t) === "today");
  const tomorrowTasks = tasks.filter((t) => getTaskColumn(t) === "tomorrow");
  const nextWeekTasks = tasks.filter((t) => getTaskColumn(t) === "next-week");

  const todayMinutes = todayTasks.reduce((sum, t) => sum + t.duration, 0);
  const tomorrowMinutes = tomorrowTasks.reduce((sum, t) => sum + t.duration, 0);
  const nextWeekMinutes = nextWeekTasks.reduce((sum, t) => sum + t.duration, 0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a column
    const columns: ColumnId[] = ["today", "tomorrow", "next-week"];
    if (columns.includes(overId as ColumnId)) {
      const targetColumn = overId as ColumnId;
      const currentColumn = getTaskColumn(tasks.find((t) => t.id === activeId)!);

      if (targetColumn !== currentColumn) {
        // Update local state
        setDeferredTasks((prev) => ({
          ...prev,
          [activeId]: targetColumn,
        }));

        // Calculate the target date
        let targetDate: Date;
        switch (targetColumn) {
          case "tomorrow":
            targetDate = tomorrow;
            break;
          case "next-week":
            targetDate = nextWeek;
            break;
          default:
            targetDate = today;
        }

        // Call the defer handler
        await onDeferTask(activeId, targetDate);
      }
      return;
    }

    // Handle reordering within the same column
    const activeTask = tasks.find((t) => t.id === activeId);
    const overTask = tasks.find((t) => t.id === overId);

    if (activeTask && overTask) {
      const activeColumn = getTaskColumn(activeTask);
      const overColumn = getTaskColumn(overTask);

      if (activeColumn === overColumn) {
        // Reorder within the same column
        const columnTasks =
          activeColumn === "today"
            ? todayTasks
            : activeColumn === "tomorrow"
            ? tomorrowTasks
            : nextWeekTasks;

        const oldIndex = columnTasks.findIndex((t) => t.id === activeId);
        const newIndex = columnTasks.findIndex((t) => t.id === overId);

        if (oldIndex !== newIndex) {
          // Reorder within the column
          const reorderedColumn = arrayMove(columnTasks, oldIndex, newIndex);

          // Build complete task order: today first, then tomorrow, then next-week
          // This ensures sortOrder values don't conflict across columns
          let allTaskIds: string[];
          if (activeColumn === "today") {
            allTaskIds = [
              ...reorderedColumn.map((t) => t.id),
              ...tomorrowTasks.map((t) => t.id),
              ...nextWeekTasks.map((t) => t.id),
            ];
          } else if (activeColumn === "tomorrow") {
            allTaskIds = [
              ...todayTasks.map((t) => t.id),
              ...reorderedColumn.map((t) => t.id),
              ...nextWeekTasks.map((t) => t.id),
            ];
          } else {
            allTaskIds = [
              ...todayTasks.map((t) => t.id),
              ...tomorrowTasks.map((t) => t.id),
              ...reorderedColumn.map((t) => t.id),
            ];
          }

          await onReorderTasks(allTaskIds);
        }
      } else {
        // Moving to a different column
        setDeferredTasks((prev) => ({
          ...prev,
          [activeId]: overColumn,
        }));

        let targetDate: Date;
        switch (overColumn) {
          case "tomorrow":
            targetDate = tomorrow;
            break;
          case "next-week":
            targetDate = nextWeek;
            break;
          default:
            targetDate = today;
        }

        await onDeferTask(activeId, targetDate);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <Group align="stretch" gap="md" wrap="nowrap">
        <DroppableColumn
          id="today"
          title={format(today, "EEEE")}
          subtitle={format(today, "MMM d")}
          tasks={todayTasks}
          totalMinutes={todayMinutes}
          onRemoveTask={(id) => void onRemoveTask(id)}
          onAddTask={onShowAddTask}
          isPrimary
        />

        <DroppableColumn
          id="tomorrow"
          title="Tomorrow"
          subtitle={format(tomorrow, "MMM d")}
          tasks={tomorrowTasks}
          totalMinutes={tomorrowMinutes}
          onRemoveTask={(id) => void onRemoveTask(id)}
        />

        <DroppableColumn
          id="next-week"
          title="Next Week"
          subtitle={format(nextWeek, "MMM d")}
          tasks={nextWeekTasks}
          totalMinutes={nextWeekMinutes}
          onRemoveTask={(id) => void onRemoveTask(id)}
        />
      </Group>

      <DragOverlay>
        {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
