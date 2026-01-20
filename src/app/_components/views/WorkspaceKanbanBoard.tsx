"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, DragOverEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ScrollArea, Group, Paper, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { KanbanColumn } from "../KanbanColumn";
import { TaskCard } from "../TaskCard";
import type { ViewGroupBy } from "~/types/view";

type ActionStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";

interface Action {
  id: string;
  name: string;
  description?: string | null;
  dueDate?: Date | null;
  kanbanStatus?: ActionStatus | null;
  priority: string;
  projectId?: string | null;
  kanbanOrder?: number | null;
  assignees: Array<{
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    };
  }>;
  project?: {
    id: string;
    name: string;
    slug?: string;
  } | null;
  tags?: Array<{
    tag: {
      id: string;
      name: string;
      slug: string;
      color: string;
    };
  }>;
}

interface WorkspaceKanbanBoardProps {
  workspaceId: string;
  actions: Action[];
  groupBy?: ViewGroupBy;
}

const STATUS_COLUMNS: { id: ActionStatus; title: string; color: string }[] = [
  { id: "BACKLOG", title: "Backlog", color: "gray" },
  { id: "TODO", title: "To Do", color: "blue" },
  { id: "IN_PROGRESS", title: "In Progress", color: "yellow" },
  { id: "IN_REVIEW", title: "In Review", color: "orange" },
  { id: "DONE", title: "Done", color: "green" },
  { id: "CANCELLED", title: "Cancelled", color: "red" },
];

// Priority order mapping
const priorityOrder: Record<string, number> = {
  '1st Priority': 1, '2nd Priority': 2, '3rd Priority': 3, '4th Priority': 4,
  '5th Priority': 5, 'Quick': 6, 'Scheduled': 7, 'Errand': 8,
  'Remember': 9, 'Watch': 10
};

export function WorkspaceKanbanBoard({ workspaceId, actions, groupBy = "STATUS" }: WorkspaceKanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Action | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, ActionStatus>>({});
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const utils = api.useUtils();

  // Mutation for updating kanban status
  const updateKanbanStatusMutation = api.view.updateKanbanStatus.useMutation({
    onMutate: async ({ actionId, kanbanStatus }) => {
      // Optimistically update
      setOptimisticUpdates(prev => ({ ...prev, [actionId]: kanbanStatus }));
      return { actionId };
    },
    onSuccess: () => {
      notifications.show({
        title: "Status Updated",
        message: "Task status has been updated",
        color: "green",
      });
    },
    onError: (error, { actionId }) => {
      // Rollback optimistic update
      setOptimisticUpdates(prev => {
        const newUpdates = { ...prev };
        delete newUpdates[actionId];
        return newUpdates;
      });
      notifications.show({
        title: "Update Failed",
        message: error.message || "Failed to update task status",
        color: "red",
      });
    },
    onSettled: () => {
      void utils.view.getViewActions.invalidate({ workspaceId });
    },
  });

  // Apply optimistic updates
  const actionsWithOptimisticUpdates = useMemo(() => {
    return actions.map(action => ({
      ...action,
      kanbanStatus: optimisticUpdates[action.id] ?? action.kanbanStatus
    }));
  }, [actions, optimisticUpdates]);

  // Get columns based on groupBy
  const columns = useMemo(() => {
    if (groupBy === "STATUS") {
      return STATUS_COLUMNS;
    }

    if (groupBy === "PROJECT") {
      // Get unique projects from actions
      const projectMap = new Map<string, { id: string; name: string }>();
      actionsWithOptimisticUpdates.forEach(action => {
        if (action.project) {
          projectMap.set(action.project.id, action.project);
        }
      });

      const projectColumns = Array.from(projectMap.values()).map(project => ({
        id: project.id,
        title: project.name,
        color: "blue",
      }));

      // Add "No Project" column if there are unassigned actions
      const hasUnassigned = actionsWithOptimisticUpdates.some(a => !a.projectId);
      if (hasUnassigned) {
        return [{ id: "no-project", title: "No Project", color: "gray" }, ...projectColumns];
      }
      return projectColumns;
    }

    return STATUS_COLUMNS;
  }, [groupBy, actionsWithOptimisticUpdates]);

  // Group actions by the selected field
  const actionsByGroup = useMemo(() => {
    return columns.reduce((acc, column) => {
      const columnActions = actionsWithOptimisticUpdates.filter(action => {
        if (groupBy === "STATUS") {
          return action.kanbanStatus === column.id ||
            (column.id === "TODO" && !action.kanbanStatus);
        }
        if (groupBy === "PROJECT") {
          return column.id === "no-project"
            ? !action.projectId
            : action.projectId === column.id;
        }
        return false;
      });

      // Sort by kanbanOrder, then priority, then ID
      acc[column.id] = columnActions.sort((a, b) => {
        const aOrder = a.kanbanOrder;
        const bOrder = b.kanbanOrder;

        if (aOrder != null && bOrder != null) {
          return aOrder - bOrder;
        }
        if (aOrder != null) return -1;
        if (bOrder != null) return 1;

        const priorityDiff = (priorityOrder[a.priority] ?? 999) - (priorityOrder[b.priority] ?? 999);
        if (priorityDiff !== 0) return priorityDiff;
        return a.id.localeCompare(b.id);
      });

      return acc;
    }, {} as Record<string, Action[]>);
  }, [columns, actionsWithOptimisticUpdates, groupBy]);

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
    const task = actionsWithOptimisticUpdates.find(action => action.id === event.active.id);
    setActiveTask(task ?? null);
    setDragOverTaskId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;

    if (over) {
      const overId = over.id as string;
      const isColumn = columns.some(col => col.id === overId);

      if (!isColumn) {
        setDragOverTaskId(overId);
      } else {
        setDragOverTaskId(null);
      }
    } else {
      setDragOverTaskId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setDragOverTaskId(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    const task = actionsWithOptimisticUpdates.find(action => action.id === taskId);
    if (!task) return;

    if (updateKanbanStatusMutation.isPending) return;

    // Only handle status changes for STATUS grouping
    if (groupBy !== "STATUS") return;

    const isColumn = columns.some(col => col.id === overId);

    if (isColumn) {
      const newStatus = overId as ActionStatus;
      const currentStatus = optimisticUpdates[taskId] ?? task.kanbanStatus ?? "TODO";

      if (currentStatus === newStatus) return;

      updateKanbanStatusMutation.mutate({
        actionId: taskId,
        kanbanStatus: newStatus,
      });
    } else {
      // Dropped on another task
      const targetTask = actionsWithOptimisticUpdates.find(action => action.id === overId);
      if (!targetTask) return;

      const newStatus = targetTask.kanbanStatus ?? "TODO";

      updateKanbanStatusMutation.mutate({
        actionId: taskId,
        kanbanStatus: newStatus,
      });
    }
  };

  const handleDragCancel = () => {
    setActiveTask(null);
    setDragOverTaskId(null);
  };

  if (!actions.length) {
    return (
      <Paper className="p-8 text-center bg-surface-primary">
        <Text size="lg" c="dimmed">
          No actions found
        </Text>
        <Text size="sm" className="text-text-secondary mt-2">
          Actions from projects in this workspace will appear here.
        </Text>
      </Paper>
    );
  }

  return (
    <div className="w-full" role="application" aria-label="Workspace Kanban board">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <ScrollArea>
          <Group
            gap="md"
            align="flex-start"
            wrap="nowrap"
            className="min-w-fit pb-4"
            style={{ minWidth: 'max-content' }}
          >
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                color={column.color}
                tasks={actionsByGroup[column.id] ?? []}
                dragOverTaskId={dragOverTaskId}
              />
            ))}
          </Group>
        </ScrollArea>

        <DragOverlay>
          {activeTask && (
            <TaskCard
              task={activeTask}
              isDragging
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
