"use client";

import { useMemo } from "react";
import { Title, Paper } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { TaskCard } from "./TaskCard";
import { KanbanBoard as SharedKanbanBoard } from "./shared/kanban";
import type { KanbanColumnDef, KanbanItem } from "./shared/kanban";

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

// The item shape handed to the shared board: an Action tagged with its column.
type BoardItem = Action & KanbanItem;

interface KanbanBoardProps {
  projectId?: string;
  actions: Action[];
  onActionOpen?: (id: string) => void;
}

const KANBAN_COLUMNS: (KanbanColumnDef & { id: ActionStatus })[] = [
  { id: "BACKLOG", title: "Backlog", accent: "slate" },
  { id: "TODO", title: "Todo", accent: "brand" },
  { id: "IN_PROGRESS", title: "In Progress", accent: "amber" },
  { id: "IN_REVIEW", title: "In Review", accent: "violet" },
  { id: "DONE", title: "Done", accent: "green" },
  { id: "CANCELLED", title: "Cancelled", accent: "red" },
];

// Priority order mapping (mirror of ~/lib/actions/priority#PRIORITY_ORDER —
// kept inline here to avoid a runtime import in the kanban hot path)
const priorityOrder: Record<string, number> = {
  '1st Priority': 1, '2nd Priority': 2, '3rd Priority': 3, '4th Priority': 4,
  '5th Priority': 5, 'Quick': 6, 'Scheduled': 7, 'Errand': 8,
  'Remember': 9, 'Watch': 10
};

// Resolve an action to its board column (unset status defaults to TODO).
const columnFor = (action: Action): ActionStatus => action.kanbanStatus ?? "TODO";

export function KanbanBoard({ projectId, actions, onActionOpen }: KanbanBoardProps) {
  const utils = api.useUtils();

  // Mutation for updating kanban status with ordering. The shared board owns the
  // optimistic column move + rollback; here we keep the tRPC cache snapshot for
  // rollback and the invalidate that reconciles ordering.
  const updateKanbanStatusMutation = api.action.updateKanbanStatusWithOrder.useMutation({
    onMutate: async () => {
      if (!projectId) return { previousActions: undefined };
      await utils.action.getProjectActions.cancel({ projectId });
      const previousActions = utils.action.getProjectActions.getData({ projectId });
      return { previousActions };
    },
    onSuccess: () => {
      notifications.show({
        title: "Status Updated",
        message: "Task status has been updated successfully",
        color: "green",
      });
    },
    onError: (error, _vars, context) => {
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
      if (projectId) {
        void utils.action.getProjectActions.invalidate({ projectId });
      }
    },
  });

  // Only project actions belong on the board.
  const boardActions = useMemo(
    () => actions.filter((action) => action.projectId),
    [actions],
  );

  // Group by column and sort within each: manual kanbanOrder → scheduledStart →
  // priority → id. Flatten in column order so the shared board's per-column
  // display order matches this (its drop index maps back onto these lists).
  const items = useMemo<BoardItem[]>(() => {
    const flattened: BoardItem[] = [];
    for (const column of KANBAN_COLUMNS) {
      const columnActions = boardActions
        .filter((action) => columnFor(action) === column.id)
        .sort((a, b) => {
          const aOrder = a.kanbanOrder;
          const bOrder = b.kanbanOrder;
          if (aOrder != null && bOrder != null) return aOrder - bOrder;
          if (aOrder != null) return -1;
          if (bOrder != null) return 1;

          const aStart = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity;
          const bStart = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity;
          if (aStart !== bStart) return aStart - bStart;

          const priorityDiff = (priorityOrder[a.priority] ?? 999) - (priorityOrder[b.priority] ?? 999);
          if (priorityDiff !== 0) return priorityDiff;

          return a.id.localeCompare(b.id);
        });

      for (const action of columnActions) {
        flattened.push({ ...action, columnId: column.id });
      }
    }
    return flattened;
  }, [boardActions]);

  // Translate the shared board's (itemId, toColumnId, toIndex) into the existing
  // status+order mutation. The card sitting at toIndex is the drop target
  // ("insert above"); a column-end drop has no target and just changes status.
  const handleMove = (itemId: string, toColumnId: string, toIndex: number) => {
    const targetColumnItems = items.filter((item) => item.columnId === toColumnId);
    const target = targetColumnItems[toIndex];
    const droppedOnTaskId = target && target.id !== itemId ? target.id : undefined;

    return updateKanbanStatusMutation.mutateAsync({
      actionId: itemId,
      kanbanStatus: toColumnId as ActionStatus,
      ...(droppedOnTaskId ? { droppedOnTaskId } : {}),
    });
  };

  return (
    <SharedKanbanBoard<BoardItem>
      columns={KANBAN_COLUMNS}
      items={items}
      onMove={handleMove}
      getItemLabel={(item) => item.name}
      bleed
      renderCard={(item, { isOverlay }) => (
        <TaskCard task={item} isDragging={isOverlay} onActionOpen={onActionOpen} />
      )}
      emptyState={
        <Paper className="p-8 text-center">
          <Title order={3} c="dimmed">
            No project tasks found
          </Title>
          <p className="text-text-secondary mt-2">
            Add tasks to a project to see them in the Kanban board.
          </p>
        </Paper>
      }
    />
  );
}
