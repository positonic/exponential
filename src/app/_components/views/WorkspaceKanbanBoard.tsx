"use client";

import { useMemo } from "react";
import { Paper, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { TaskCard } from "../TaskCard";
import { KanbanBoard as SharedKanbanBoard } from "../shared/kanban";
import type { ColumnAccent, KanbanColumnDef, KanbanItem } from "../shared/kanban";
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
    listId: string;
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

// A board item carries its Action plus the column it currently sits in. The
// item id is decoupled from the action id: in STATUS mode (the only draggable
// axis) it IS the action id so the card's `useSortable` matches; in the other
// modes it's composite so a single action can appear under multiple columns
// (e.g. an action in several lists).
interface BoardItem extends KanbanItem {
  action: Action;
}

const STATUS_COLUMNS: { id: ActionStatus; title: string; color: string }[] = [
  { id: "BACKLOG", title: "Backlog", color: "gray" },
  { id: "TODO", title: "To Do", color: "blue" },
  { id: "IN_PROGRESS", title: "In Progress", color: "yellow" },
  { id: "IN_REVIEW", title: "In Review", color: "orange" },
  { id: "DONE", title: "Done", color: "green" },
  { id: "CANCELLED", title: "Cancelled", color: "red" },
];

function mapColorToAccent(color: string): ColumnAccent {
  switch (color) {
    case "blue":
      return "brand";
    case "yellow":
      return "amber";
    case "orange":
      return "violet";
    case "green":
      return "green";
    case "red":
      return "red";
    case "gray":
    default:
      return "slate";
  }
}

// Priority order mapping
const priorityOrder: Record<string, number> = {
  '1st Priority': 1, '2nd Priority': 2, '3rd Priority': 3, '4th Priority': 4,
  '5th Priority': 5, 'Quick': 6, 'Scheduled': 7, 'Errand': 8,
  'Remember': 9, 'Watch': 10
};

function sortActions(a: Action, b: Action): number {
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
}

export function WorkspaceKanbanBoard({ workspaceId, actions, groupBy = "STATUS" }: WorkspaceKanbanBoardProps) {
  const utils = api.useUtils();

  // Only STATUS grouping mutates on drop; the shared board owns the optimistic
  // move + rollback, so here we keep just the notification + invalidate.
  const updateKanbanStatusMutation = api.view.updateKanbanStatus.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Status Updated",
        message: "Task status has been updated",
        color: "green",
      });
    },
    onError: (error) => {
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

  // Column definitions for the current grouping (with a Mantine colour we map to
  // the shared accent vocabulary).
  const columns = useMemo<{ id: string; title: string; color: string }[]>(() => {
    if (groupBy === "PROJECT") {
      const projectMap = new Map<string, { id: string; name: string }>();
      actions.forEach((action) => {
        if (action.project) projectMap.set(action.project.id, action.project);
      });
      const projectColumns = Array.from(projectMap.values()).map((project) => ({
        id: project.id,
        title: project.name,
        color: "blue",
      }));
      const hasUnassigned = actions.some((a) => !a.projectId);
      return hasUnassigned
        ? [{ id: "no-project", title: "No Project", color: "gray" }, ...projectColumns]
        : projectColumns;
    }

    if (groupBy === "LIST") {
      const listMap = new Map<string, { id: string; name: string; listType: string }>();
      actions.forEach((action) => {
        action.lists?.forEach((al) => listMap.set(al.list.id, al.list));
      });
      const listColumns = Array.from(listMap.values()).map((list) => ({
        id: list.id,
        title: list.name,
        color: list.listType === "SPRINT" ? "blue" : "gray",
      }));
      const hasUnassigned = actions.some((a) => !a.lists || a.lists.length === 0);
      return hasUnassigned
        ? [{ id: "no-list", title: "No List", color: "gray" }, ...listColumns]
        : listColumns;
    }

    if (groupBy === "PRIORITY") {
      const prioritySet = new Set<string>();
      actions.forEach((action) => prioritySet.add(action.priority));
      return Array.from(prioritySet)
        .sort((a, b) => (priorityOrder[a] ?? 999) - (priorityOrder[b] ?? 999))
        .map((p) => ({
          id: p,
          title: p,
          color: (priorityOrder[p] ?? 999) <= 3 ? "red" : (priorityOrder[p] ?? 999) <= 5 ? "yellow" : "gray",
        }));
    }

    return STATUS_COLUMNS;
  }, [groupBy, actions]);

  // Whether an action belongs in a given column, for the active grouping.
  const belongsInColumn = (action: Action, columnId: string): boolean => {
    switch (groupBy) {
      case "PROJECT":
        return columnId === "no-project" ? !action.projectId : action.projectId === columnId;
      case "LIST":
        return columnId === "no-list"
          ? !action.lists || action.lists.length === 0
          : (action.lists?.some((al) => al.list.id === columnId) ?? false);
      case "PRIORITY":
        return action.priority === columnId;
      case "STATUS":
      default:
        return action.kanbanStatus === columnId || (columnId === "TODO" && !action.kanbanStatus);
    }
  };

  // Flatten to board items in column + sorted order. In STATUS mode the item id
  // is the action id (draggable); otherwise it is composite so multi-column
  // membership (lists) is preserved.
  const items = useMemo<BoardItem[]>(() => {
    const flattened: BoardItem[] = [];
    for (const column of columns) {
      const columnActions = actions.filter((a) => belongsInColumn(a, column.id)).sort(sortActions);
      for (const action of columnActions) {
        flattened.push({
          id: groupBy === "STATUS" ? action.id : `${column.id}::${action.id}`,
          columnId: column.id,
          action,
        });
      }
    }
    return flattened;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, actions, groupBy]);

  const sharedColumns = useMemo<KanbanColumnDef[]>(
    () => columns.map((c) => ({ id: c.id, title: c.title, accent: mapColorToAccent(c.color) })),
    [columns],
  );

  const handleMove = (itemId: string, toColumnId: string) => {
    // Only reached in STATUS mode (the board is `disabled` otherwise), where the
    // item id is the action id and the column id is the target status.
    return updateKanbanStatusMutation.mutateAsync({
      actionId: itemId,
      kanbanStatus: toColumnId as ActionStatus,
    });
  };

  return (
    <SharedKanbanBoard<BoardItem>
      columns={sharedColumns}
      items={items}
      onMove={handleMove}
      disabled={groupBy !== "STATUS"}
      getItemLabel={(item) => item.action.name}
      renderCard={(item, { isOverlay }) => <TaskCard task={item.action} isDragging={isOverlay} />}
      emptyState={
        <Paper className="p-8 text-center bg-surface-primary">
          <Text size="lg" c="dimmed">
            No actions found
          </Text>
          <Text size="sm" className="text-text-secondary mt-2">
            Actions from projects in this workspace will appear here.
          </Text>
        </Paper>
      }
    />
  );
}
