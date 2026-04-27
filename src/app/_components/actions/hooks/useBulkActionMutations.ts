import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface BulkContext {
  viewName?: string;
  projectId?: string;
}

interface BulkRescheduleInput {
  actionIds: string[];
  dueDate: Date | null;
  /** Label shown in the toast (e.g. "Tomorrow"). */
  label?: string;
  /** When true, fires `dailyPlan.markProcessedOverdue` after success. */
  fromOverdue?: boolean;
  onSuccess?: (data: { count: number }) => void;
  onError?: () => void;
}

interface BulkDeleteInput {
  actionIds: string[];
  fromOverdue?: boolean;
  onSuccess?: (data: { count: number }) => void;
  onError?: () => void;
}

interface BulkAssignProjectInput {
  actionIds: string[];
  projectId: string;
  onSuccess?: (data: { count: number }) => void;
  onError?: () => void;
}

interface UseBulkActionMutationsResult {
  bulkReschedule: (input: BulkRescheduleInput) => void;
  bulkDelete: (input: BulkDeleteInput) => void;
  bulkAssignProject: (input: BulkAssignProjectInput) => void;
  isMutating: boolean;
}

export function useBulkActionMutations(
  _context: BulkContext = {},
): UseBulkActionMutationsResult {
  const utils = api.useUtils();

  const invalidateAll = () => {
    void utils.action.getAll.invalidate();
    void utils.action.getToday.invalidate();
    void utils.scoring.getTodayScore.invalidate();
    void utils.scoring.getProductivityStats.invalidate();
  };

  const markProcessedOverdue = api.dailyPlan.markProcessedOverdue.useMutation({
    onSuccess: () => {
      void utils.scoring.getTodayScore.invalidate();
      void utils.scoring.getProductivityStats.invalidate();
      void utils.dailyPlan.invalidate();
    },
  });

  const reschedule = api.action.bulkReschedule.useMutation({
    onSettled: invalidateAll,
  });

  const remove = api.action.bulkDelete.useMutation({
    onSettled: invalidateAll,
  });

  const assignProject = api.action.bulkAssignProject.useMutation({
    onSettled: invalidateAll,
  });

  const isMutating =
    reschedule.isPending || remove.isPending || assignProject.isPending;

  return {
    bulkReschedule: ({
      actionIds,
      dueDate,
      label,
      fromOverdue,
      onSuccess,
      onError,
    }) => {
      if (actionIds.length === 0) return;
      reschedule.mutate(
        { actionIds, dueDate },
        {
          onSuccess: (data) => {
            notifications.show({
              title: dueDate ? "Bulk reschedule complete" : "Due date removed",
              message: dueDate
                ? `Rescheduled ${data.count} action${data.count === 1 ? "" : "s"}${label ? ` to ${label}` : ""}`
                : `Cleared due date from ${data.count} action${data.count === 1 ? "" : "s"}`,
              color: "green",
            });
            if (fromOverdue) markProcessedOverdue.mutate({});
            onSuccess?.(data);
          },
          onError: () => {
            notifications.show({
              title: "Reschedule failed",
              message: "Could not reschedule the selected actions.",
              color: "red",
            });
            onError?.();
          },
        },
      );
    },

    bulkDelete: ({ actionIds, fromOverdue, onSuccess, onError }) => {
      if (actionIds.length === 0) return;
      remove.mutate(
        { actionIds },
        {
          onSuccess: (data) => {
            notifications.show({
              title: "Actions deleted",
              message: `Deleted ${data.count} action${data.count === 1 ? "" : "s"}`,
              color: "green",
            });
            if (fromOverdue) markProcessedOverdue.mutate({});
            onSuccess?.(data);
          },
          onError: () => {
            notifications.show({
              title: "Delete failed",
              message: "Could not delete the selected actions.",
              color: "red",
            });
            onError?.();
          },
        },
      );
    },

    bulkAssignProject: ({ actionIds, projectId, onSuccess, onError }) => {
      if (actionIds.length === 0 || !projectId) return;
      assignProject.mutate(
        { actionIds, projectId },
        {
          onSuccess: (data) => {
            notifications.show({
              title: "Actions reassigned",
              message: `Moved ${data.count} action${data.count === 1 ? "" : "s"}`,
              color: "green",
            });
            onSuccess?.(data);
          },
          onError: () => {
            notifications.show({
              title: "Reassign failed",
              message: "Could not reassign the selected actions.",
              color: "red",
            });
            onError?.();
          },
        },
      );
    },

    isMutating,
  };
}
