"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';
import { notifications } from "@mantine/notifications";

export function TodayActions() {
  const todayActions = api.action.getToday.useQuery();

  // Bulk delete mutation for overdue actions
  const bulkDeleteMutation = api.action.bulkDelete.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Overdue Actions Deleted',
        message: `Successfully deleted ${data.count} overdue actions`,
        color: 'green',
      });
      void todayActions.refetch();
    },
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

  // Handle overdue bulk delete
  const handleOverdueBulkAction = (action: 'delete', actionIds: string[]) => {
    if (action === 'delete') {
      bulkDeleteMutation.mutate({
        actionIds,
      });
    }
  };

  // Handle overdue bulk reschedule
  const handleOverdueBulkReschedule = (date: Date | null, actionIds: string[]) => {
    if (actionIds.length === 0) return;
    
    // Update all selected actions one by one
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
          // Show final notification when all are done
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