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
  scheduledStart?: Date | null;
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
  lists?: Array<{
    list: {
      id: string;
      name: string;
      slug: string;
      listType: string;
      status: string;
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
      // Only set if not already set by handleDragEnd (avoid duplicate render)
      setOptimisticUpdates(prev => {
        if (prev[actionId] === kanbanStatus) return prev;
        return { ...prev, [actionId]: kanbanStatus };
      });
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

    if (groupBy === "LIST") {
      const listMap = new Map<string, { id: string; name: string; listType: string }>();
      actionsWithOptimisticUpdates.forEach(action => {
        action.lists?.forEach(al => {
          listMap.set(al.list.id, al.list);
        });
      });

      const listColumns = Array.from(listMap.values()).map(list => ({
        id: list.id,
        title: list.name,
        color: list.listType === "SPRINT" ? "blue" : "gray",
      }));

      const hasUnassigned = actionsWithOptimisticUpdates.some(
        a => !a.lists || a.lists.length === 0
      );
      if (hasUnassigned) {
        return [{ id: "no-list", title: "No List", color: "gray" }, ...listColumns];
      }
      return listColumns;
    }

    if (groupBy === "PRIORITY") {
      const prioritySet = new Set<string>();
      actionsWithOptimisticUpdates.forEach(action => {
        prioritySet.add(action.priority);
      });

      return Array.from(prioritySet)
        .sort((a, b) => (priorityOrder[a] ?? 999) - (priorityOrder[b] ?? 999))
        .map(p => ({
          id: p,
          title: p,
          color: (priorityOrder[p] ?? 999) <= 3 ? "red" : (priorityOrder[p] ?? 999) <= 5 ? "yellow" : "gray",
        }));
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
        if (groupBy === "LIST") {
          if (column.id === "no-list") {
            return !action.lists || action.lists.length === 0;
          }
          return action.lists?.some(al => al.list.id === column.id) ?? false;
        }
        if (groupBy === "PRIORITY") {
          return action.priority === column.id;
        }
        return false;
      });

      // Sort by kanbanOrder (manual positioning), then scheduledStart, then priority, then ID
      acc[column.id] = columnActions.sort((a, b) => {
        const aOrder = a.kanbanOrder;
        const bOrder = b.kanbanOrder;

        // 1. Manual positioning takes precedence (if BOTH have kanbanOrder)
        if (aOrder != null && bOrder != null) {
          return aOrder - bOrder;
        }
        if (aOrder != null) return -1;
        if (bOrder != null) return 1;

        // 2. Sort by scheduledStart (ascending - earliest first, null/undefined at end)
        const aScheduledStart = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity;
        const bScheduledStart = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity;
        if (aScheduledStart !== bScheduledStart) {
          return aScheduledStart - bScheduledStart;
        }

        // 3. Sort by priority (1st Priority first)
        const priorityDiff = (priorityOrder[a.priority] ?? 999) - (priorityOrder[b.priority] ?? 999);
        if (priorityDiff !== 0) return priorityDiff;

        // 4. Tiebreaker: by ID
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
    setDragOverTaskId(null);

    if (!over) {
      setActiveTask(null);
      return;
    }

    const taskId = active.id as string;
    const overId = over.id as string;

    const task = actionsWithOptimisticUpdates.find(action => action.id === taskId);
    if (!task) {
      setActiveTask(null);
      return;
    }

    if (updateKanbanStatusMutation.isPending) {
      setActiveTask(null);
      return;
    }

    // Only handle status changes for STATUS grouping
    if (groupBy !== "STATUS") {
      setActiveTask(null);
      return;
    }

    // Determine the new status
    const isColumn = columns.some(col => col.id === overId);
    let newStatus: ActionStatus;

    if (isColumn) {
      newStatus = overId as ActionStatus;
    } else {
      // Dropped on another task - use that task's status
      const targetTask = actionsWithOptimisticUpdates.find(action => action.id === overId);
      if (!targetTask) {
        setActiveTask(null);
        return;
      }
      newStatus = targetTask.kanbanStatus ?? "TODO";
    }

    const currentStatus = optimisticUpdates[taskId] ?? task.kanbanStatus ?? "TODO";

    if (currentStatus === newStatus) {
      setActiveTask(null);
      return;
    }

    // CRITICAL: Apply optimistic update BEFORE clearing activeTask
    // This ensures the card is in its new position when DragOverlay disappears
    setOptimisticUpdates(prev => ({ ...prev, [taskId]: newStatus }));

    // NOW clear activeTask (DragOverlay disappears, but card is already in new position)
    setActiveTask(null);

    // Fire the mutation
    updateKanbanStatusMutation.mutate({
      actionId: taskId,
      kanbanStatus: newStatus,
    });
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
