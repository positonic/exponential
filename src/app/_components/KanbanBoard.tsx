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
import { ScrollArea, Group, Title, Paper } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

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
  } | null;
}

interface KanbanBoardProps {
  projectId?: string;
  actions: Action[];
}

const KANBAN_COLUMNS: { id: ActionStatus; title: string; color: string }[] = [
  { id: "BACKLOG", title: "Backlog", color: "gray" },
  { id: "TODO", title: "Todo", color: "blue" },
  { id: "IN_PROGRESS", title: "In Progress", color: "yellow" },
  { id: "IN_REVIEW", title: "In Review", color: "orange" },
  { id: "DONE", title: "Done", color: "green" },
  { id: "CANCELLED", title: "Cancelled", color: "red" },
];

// Priority order mapping (matching ActionList.tsx for consistency)
const priorityOrder: Record<string, number> = {
  '1st Priority': 1, '2nd Priority': 2, '3rd Priority': 3, '4th Priority': 4,
  '5th Priority': 5, 'Quick': 6, 'Scheduled': 7, 'Errand': 8,
  'Remember': 9, 'Watch': 10
};

export function KanbanBoard({ projectId, actions }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Action | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, ActionStatus>>({});
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const utils = api.useUtils();

  // Mutation for updating kanban status with ordering
  const updateKanbanStatusMutation = api.action.updateKanbanStatusWithOrder.useMutation({
    onMutate: async ({ actionId, kanbanStatus }) => {
      // Cancel outgoing refetches
      await utils.action.getProjectActions.cancel({ projectId: projectId! });

      // Snapshot the previous value
      const previousActions = utils.action.getProjectActions.getData({ projectId: projectId! });

      // Only set if not already set by handleDragEnd (avoid duplicate render)
      setOptimisticUpdates(prev => {
        if (prev[actionId] === kanbanStatus) return prev;
        return { ...prev, [actionId]: kanbanStatus };
      });

      return { previousActions, actionId, originalStatus: previousActions?.find((a: any) => a.id === actionId)?.kanbanStatus };
    },
    onSuccess: (_, { actionId: _actionId }) => {
      // Clear optimistic update on success
      // setOptimisticUpdates(prev => {
      //   const newUpdates = { ...prev };
      //   delete newUpdates[actionId];
      //   return newUpdates;
      // });
      notifications.show({
        title: "Status Updated",
        message: "Task status has been updated successfully",
        color: "green",
      });
    },
    onError: (error, { actionId }, context) => {
      // Rollback optimistic update on error
      setOptimisticUpdates(prev => {
        const newUpdates = { ...prev };
        delete newUpdates[actionId];
        return newUpdates;
      });
      
      // Restore previous data if available
      if (context?.previousActions && projectId) {
        utils.action.getProjectActions.setData({ projectId }, context.previousActions);
      }
      
      notifications.show({
        title: "Update Failed",
        message: error.message || "Failed to update task status",
        color: "red",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      if (projectId) {
        void utils.action.getProjectActions.invalidate({ projectId });
      }
    },
  });

  // Apply optimistic updates to actions
  const actionsWithOptimisticUpdates = useMemo(() => {
    return actions.map(action => ({
      ...action,
      kanbanStatus: optimisticUpdates[action.id] ?? action.kanbanStatus
    }));
  }, [actions, optimisticUpdates]);

  // Filter actions that have kanban status or assign default status
  const kanbanActions = actionsWithOptimisticUpdates.filter(action =>
    action.projectId && (action.kanbanStatus || action.kanbanStatus === null)
  );

  // Group actions by status and sort by priority (with manual kanbanOrder override)
  const actionsByStatus = useMemo(() => {
    return KANBAN_COLUMNS.reduce((acc, column) => {
      const columnActions = kanbanActions.filter(
        action => action.kanbanStatus === column.id ||
        (column.id === "TODO" && !action.kanbanStatus) // Default to TODO if no status
      );

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
    }, {} as Record<ActionStatus, Action[]>);
  }, [kanbanActions]);

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
    const task = kanbanActions.find(action => action.id === event.active.id);
    setActiveTask(task || null);
    setDragOverTaskId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    
    if (over) {
      const overId = over.id as string;
      const isColumn = KANBAN_COLUMNS.some(col => col.id === overId);
      
      if (!isColumn) {
        // Dragging over a task
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

    // Find the task being moved
    const task = kanbanActions.find(action => action.id === taskId);
    if (!task) {
      setActiveTask(null);
      return;
    }

    // Prevent concurrent updates for the same task
    if (updateKanbanStatusMutation.isPending) {
      setActiveTask(null);
      return;
    }

    // Determine the new status and whether we're dropping on a column or task
    const isColumn = KANBAN_COLUMNS.some(col => col.id === overId);
    let newStatus: ActionStatus;
    let droppedOnTaskId: string | undefined;

    if (isColumn) {
      newStatus = overId as ActionStatus;
    } else {
      // Dropped on another task - use that task's status
      const targetTask = kanbanActions.find(action => action.id === overId);
      if (!targetTask) {
        setActiveTask(null);
        return;
      }
      newStatus = targetTask.kanbanStatus ?? "TODO";
      droppedOnTaskId = overId;
    }

    const currentStatus = optimisticUpdates[taskId] ?? task.kanbanStatus ?? "TODO";

    // If status hasn't changed and not reordering within column, do nothing
    if (currentStatus === newStatus && !droppedOnTaskId) {
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
      ...(droppedOnTaskId ? { droppedOnTaskId } : {}),
    });
  };

  const handleDragCancel = () => {
    setActiveTask(null);
    setDragOverTaskId(null);
  };

  if (!kanbanActions.length) {
    return (
      <Paper className="p-8 text-center">
        <Title order={3} c="dimmed">
          No project tasks found
        </Title>
        <p className="text-text-secondary mt-2">
          Add tasks to a project to see them in the Kanban board.
        </p>
      </Paper>
    );
  }

  return (
    <div className="w-full" role="application" aria-label="Kanban board">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements: {
            onDragStart({ active }) {
              const activeTask = kanbanActions.find(task => task.id === active.id);
              return `Started dragging task: ${activeTask?.name || active.id}`;
            },
            onDragOver({ active, over }) {
              const activeTask = kanbanActions.find(task => task.id === active.id);
              if (over) {
                const isColumn = KANBAN_COLUMNS.some(col => col.id === over.id);
                if (isColumn) {
                  const column = KANBAN_COLUMNS.find(col => col.id === over.id);
                  return `${activeTask?.name || active.id} is over ${column?.title} column`;
                } else {
                  const targetTask = kanbanActions.find(task => task.id === over.id);
                  return `${activeTask?.name || active.id} is over task: ${targetTask?.name || over.id}`;
                }
              }
              return `${activeTask?.name || active.id} is no longer over a droppable area`;
            },
            onDragEnd({ active, over }) {
              const activeTask = kanbanActions.find(task => task.id === active.id);
              if (over) {
                const isColumn = KANBAN_COLUMNS.some(col => col.id === over.id);
                if (isColumn) {
                  const column = KANBAN_COLUMNS.find(col => col.id === over.id);
                  return `${activeTask?.name || active.id} was moved to ${column?.title} column`;
                } else {
                  const targetTask = kanbanActions.find(task => task.id === over.id);
                  return `${activeTask?.name || active.id} was placed above ${targetTask?.name || over.id}`;
                }
              }
              return `${activeTask?.name || active.id} was dropped`;
            },
            onDragCancel({ active }) {
              const activeTask = kanbanActions.find(task => task.id === active.id);
              return `Dragging ${activeTask?.name || active.id} was cancelled`;
            },
          },
        }}
      >
        <ScrollArea>
          <Group 
            gap="md" 
            align="flex-start" 
            wrap="nowrap" 
            className="min-w-fit pb-4"
            style={{ minWidth: 'max-content' }}
          >
            {KANBAN_COLUMNS.map((column) => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                color={column.color}
                tasks={actionsByStatus[column.id] || []}
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