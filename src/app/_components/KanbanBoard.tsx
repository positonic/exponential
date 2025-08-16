"use client";

import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverEvent,
  closestCenter,
  rectIntersection,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
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

export function KanbanBoard({ projectId, actions }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Action | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, ActionStatus>>({});
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const utils = api.useUtils();

  // Mutation for initializing kanban orders for existing tasks
  const initializeOrdersMutation = api.action.initializeKanbanOrders.useMutation({
    onSuccess: () => {
      if (projectId) {
        void utils.action.getProjectActions.invalidate({ projectId });
      }
    },
  });

  // Mutation for updating kanban status with ordering
  const updateKanbanStatusMutation = api.action.updateKanbanStatusWithOrder.useMutation({
    onMutate: async ({ actionId, kanbanStatus }) => {
      // Cancel outgoing refetches
      await utils.action.getProjectActions.cancel({ projectId: projectId! });
      
      // Snapshot the previous value
      const previousActions = utils.action.getProjectActions.getData({ projectId: projectId! });
      
      // Optimistically update the action
      setOptimisticUpdates(prev => ({ ...prev, [actionId]: kanbanStatus }));
      
      return { previousActions, actionId, originalStatus: previousActions?.find((a: any) => a.id === actionId)?.kanbanStatus };
    },
    onSuccess: (_, { actionId }) => {
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

  // Check if we need to initialize orders for existing tasks
  useEffect(() => {
    if (projectId && actions.length > 0) {
      const tasksWithoutOrder = actions.filter(action => 
        action.projectId && action.kanbanOrder === null
      );
      
      if (tasksWithoutOrder.length > 0 && !initializeOrdersMutation.isPending) {
        console.log(`Initializing kanban orders for ${tasksWithoutOrder.length} existing tasks`);
        initializeOrdersMutation.mutate({ projectId });
      }
    }
  }, [projectId, actions, initializeOrdersMutation]);

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

  // Group actions by status and sort by kanbanOrder
  const actionsByStatus = useMemo(() => {
    return KANBAN_COLUMNS.reduce((acc, column) => {
      const columnActions = kanbanActions.filter(
        action => action.kanbanStatus === column.id || 
        (column.id === "TODO" && !action.kanbanStatus) // Default to TODO if no status
      );
      
      // Sort by kanbanOrder, with nulls at the end
      acc[column.id] = columnActions.sort((a, b) => {
        const orderA = a.kanbanOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.kanbanOrder ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
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
    setActiveTask(null);
    setDragOverTaskId(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Find the task being moved
    const task = kanbanActions.find(action => action.id === taskId);
    if (!task) return;

    // Prevent concurrent updates for the same task
    if (updateKanbanStatusMutation.isPending) return;

    // Determine if we're dropping on a column or on another task
    const isColumn = KANBAN_COLUMNS.some(col => col.id === overId);
    
    if (isColumn) {
      // Dropped on a column
      const newStatus = overId as ActionStatus;
      const currentStatus = optimisticUpdates[taskId] ?? task.kanbanStatus ?? "TODO";
      
      // If status hasn't changed, do nothing
      if (currentStatus === newStatus) return;

      // Update the task status (API will handle ordering)
      updateKanbanStatusMutation.mutate({
        actionId: taskId,
        kanbanStatus: newStatus,
      });
    } else {
      // Dropped on another task - need to insert at that position
      const targetTask = kanbanActions.find(action => action.id === overId);
      if (!targetTask) return;

      const newStatus = targetTask.kanbanStatus ?? "TODO";
      
      // Find the position of the target task in its column
      const columnTasks = actionsByStatus[newStatus] ?? [];
      const targetPosition = columnTasks.findIndex(task => task.id === overId);
      
      if (targetPosition === -1) return;

      // Use the insertion-based ordering approach
      updateKanbanStatusMutation.mutate({
        actionId: taskId,
        kanbanStatus: newStatus,
        droppedOnTaskId: overId,
      });
    }
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