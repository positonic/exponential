"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
import { HTMLContent } from "~/app/_components/HTMLContent";
import { PRIORITY_VALUES } from "~/types/priority";

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
            <Text size="sm" fw={500} className="text-text-primary" lineClamp={2} component="div">
              <HTMLContent html={task.name} />
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
          <Text size="sm" fw={500} className="text-text-primary" lineClamp={2} component="div">
            <HTMLContent html={task.name} />
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

  // Priority rank map for default sorting (lower index = higher priority)
  const priorityRank = useMemo(() => {
    const map = new Map<string, number>();
    PRIORITY_VALUES.forEach((val, idx) => map.set(val, idx));
    return map;
  }, []);

  const getTaskPriorityRank = (task: DailyPlanAction): number => {
    const priority = task.action?.priority;
    if (!priority) return PRIORITY_VALUES.length;
    return priorityRank.get(priority) ?? PRIORITY_VALUES.length;
  };

  const getTaskColumnFromData = (task: DailyPlanAction): ColumnId => {
    if (task.scheduledStart) {
      const taskDate = startOfDay(new Date(task.scheduledStart));
      if (taskDate.getTime() === today.getTime()) return "today";
      if (taskDate.getTime() === tomorrow.getTime()) return "tomorrow";
      if (taskDate >= nextWeek) return "next-week";
    }
    return "today";
  };

  // Derive priority-sorted columns from server data
  const sortedColumns = useMemo(() => {
    const todayArr = tasks
      .filter((t) => getTaskColumnFromData(t) === "today")
      .sort((a, b) => getTaskPriorityRank(a) - getTaskPriorityRank(b));
    const tomorrowArr = tasks
      .filter((t) => getTaskColumnFromData(t) === "tomorrow")
      .sort((a, b) => getTaskPriorityRank(a) - getTaskPriorityRank(b));
    const nextWeekArr = tasks
      .filter((t) => getTaskColumnFromData(t) === "next-week")
      .sort((a, b) => getTaskPriorityRank(a) - getTaskPriorityRank(b));
    return { today: todayArr, tomorrow: tomorrowArr, "next-week": nextWeekArr };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, today.getTime(), tomorrow.getTime(), nextWeek.getTime()]);

  // Optimistic local state for smooth drag-and-drop (null = use sortedColumns)
  const [optimisticColumns, setOptimisticColumns] = useState<Record<ColumnId, DailyPlanAction[]> | null>(null);
  const prevTasksRef = useRef(tasks);

  // Reset optimistic state when server data changes (after refetch)
  useEffect(() => {
    if (prevTasksRef.current !== tasks) {
      prevTasksRef.current = tasks;
      setOptimisticColumns(null);
    }
  }, [tasks]);

  // Active column data for rendering
  const todayTasks = optimisticColumns?.today ?? sortedColumns.today;
  const tomorrowTasks = optimisticColumns?.tomorrow ?? sortedColumns.tomorrow;
  const nextWeekTasks = optimisticColumns?.["next-week"] ?? sortedColumns["next-week"];

  const todayMinutes = todayTasks.reduce((sum, t) => sum + t.duration, 0);
  const tomorrowMinutes = tomorrowTasks.reduce((sum, t) => sum + t.duration, 0);
  const nextWeekMinutes = nextWeekTasks.reduce((sum, t) => sum + t.duration, 0);

  // Helper to get current column data (optimistic or sorted)
  const getCurrentColumns = (): Record<ColumnId, DailyPlanAction[]> =>
    optimisticColumns ?? sortedColumns;

  const getColumnForTask = (taskId: string): ColumnId | null => {
    const cols = getCurrentColumns();
    if (cols.today.some((t) => t.id === taskId)) return "today";
    if (cols.tomorrow.some((t) => t.id === taskId)) return "tomorrow";
    if (cols["next-week"].some((t) => t.id === taskId)) return "next-week";
    return null;
  };

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
    const currentColumns = getCurrentColumns();

    // Check if dropped on a column droppable
    const columnIds: ColumnId[] = ["today", "tomorrow", "next-week"];
    if (columnIds.includes(overId as ColumnId)) {
      const targetColumn = overId as ColumnId;
      const currentColumn = getColumnForTask(activeId);

      if (currentColumn && targetColumn !== currentColumn) {
        const task = currentColumns[currentColumn].find((t) => t.id === activeId);
        if (task) {
          // Optimistically move task between columns
          setOptimisticColumns({
            ...currentColumns,
            [currentColumn]: currentColumns[currentColumn].filter((t) => t.id !== activeId),
            [targetColumn]: [...currentColumns[targetColumn], task],
          });
        }

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

        await onDeferTask(activeId, targetDate);
      }
      return;
    }

    // Handle reordering within the same column or cross-column via task drop target
    const activeColumn = getColumnForTask(activeId);
    const overColumn = getColumnForTask(overId);

    if (activeColumn && overColumn) {
      if (activeColumn === overColumn) {
        // Reorder within the same column
        const columnTasks = currentColumns[activeColumn];
        const oldIndex = columnTasks.findIndex((t) => t.id === activeId);
        const newIndex = columnTasks.findIndex((t) => t.id === overId);

        if (oldIndex !== newIndex) {
          const reorderedColumn = arrayMove(columnTasks, oldIndex, newIndex);

          // Optimistically update the column
          setOptimisticColumns({
            ...currentColumns,
            [activeColumn]: reorderedColumn,
          });

          // Build complete task order for API
          const allTaskIds = [
            ...(activeColumn === "today" ? reorderedColumn : currentColumns.today).map((t) => t.id),
            ...(activeColumn === "tomorrow" ? reorderedColumn : currentColumns.tomorrow).map((t) => t.id),
            ...(activeColumn === "next-week" ? reorderedColumn : currentColumns["next-week"]).map((t) => t.id),
          ];

          await onReorderTasks(allTaskIds);
        }
      } else {
        // Moving to a different column (dropped on a task in another column)
        const task = currentColumns[activeColumn].find((t) => t.id === activeId);
        if (task) {
          setOptimisticColumns({
            ...currentColumns,
            [activeColumn]: currentColumns[activeColumn].filter((t) => t.id !== activeId),
            [overColumn]: [...currentColumns[overColumn], task],
          });
        }

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
