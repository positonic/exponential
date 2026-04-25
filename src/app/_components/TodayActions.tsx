"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';
import { notifications } from "@mantine/notifications";

export function TodayActions() {
  const utils = api.useUtils();
  const todayActions = api.action.getToday.useQuery();

  const invalidateScoring = () => {
    void utils.scoring.getTodayScore.invalidate();
    void utils.scoring.getProductivityStats.invalidate();
    void utils.dailyPlan.invalidate();
  };

  // Bulk delete mutation for overdue actions
  const bulkDeleteMutation = api.action.bulkDelete.useMutation({
    onError: (error) => {
      notifications.show({
        title: 'Delete Failed',
        message: error.message || 'Failed to delete overdue actions',
        color: 'red',
      });
    },
  });

  // Bulk update mutation for rescheduling
  const bulkUpdateMutation = api.action.update.useMutation();
  const markProcessedOverdue = api.dailyPlan.markProcessedOverdue.useMutation({
    onSuccess: () => {
      invalidateScoring();
    },
  });

  // Handle overdue bulk delete
  const handleOverdueBulkAction = (action: 'delete', actionIds: string[]) => {
    if (action === 'delete') {
      bulkDeleteMutation.mutate({ actionIds }, {
        onSuccess: (data) => {
          notifications.show({
            title: 'Overdue Actions Deleted',
            message: `Successfully deleted ${data.count} overdue actions`,
            color: 'green',
          });
          void todayActions.refetch();
          invalidateScoring();
          markProcessedOverdue.mutate({});
        },
      });
    }
  };

  // Handle overdue bulk reschedule
  const handleOverdueBulkReschedule = (date: Date | null, actionIds: string[]) => {
    if (actionIds.length === 0) return;

    let completedCount = 0;
    const totalCount = actionIds.length;

    actionIds.forEach((actionId) => {
      bulkUpdateMutation.mutate({
        id: actionId,
        scheduledStart: date,
        dueDate: date ?? undefined
      }, {
        onSuccess: () => {
          completedCount++;
          if (completedCount === totalCount) {
            const message = date
              ? `Successfully rescheduled ${totalCount} action${totalCount !== 1 ? 's' : ''} to ${date.toDateString()}`
              : `Successfully removed due date from ${totalCount} action${totalCount !== 1 ? 's' : ''}`;
            notifications.show({
              title: date ? 'Bulk Reschedule Complete' : 'Due Date Removed',
              message,
              color: 'green',
            });
            void todayActions.refetch();
            invalidateScoring();
            markProcessedOverdue.mutate({});
          }
        },
        onError: () => {
          notifications.show({
            title: 'Reschedule Failed',
            message: `Failed to reschedule action ${actionId}`,
            color: 'red',
          });
        }
      });
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <ActionList 
        viewName="Today" 
        actions={todayActions.data ?? []} 
        enableBulkEditForOverdue={true}
        onOverdueBulkAction={handleOverdueBulkAction}
        onOverdueBulkReschedule={handleOverdueBulkReschedule}
      />
      <div className="mt-6">
        <CreateActionModal viewName="Today" />
      </div>
    </div>
  );
} 