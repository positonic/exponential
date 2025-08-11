"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';
import { IconLayoutKanban, IconList } from "@tabler/icons-react";
import { Button, Title, Stack, Paper, Text, Group } from "@mantine/core";
import { useState, useEffect } from "react";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { notifications } from "@mantine/notifications";

type OutcomeType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'life' | 'problem';

interface ActionsProps {
  viewName: string;
  defaultView?: 'list' | 'alignment';
  projectId?: string;
  displayAlignment?: boolean;
}

export function Actions({ viewName, defaultView = 'list', projectId, displayAlignment = false }: ActionsProps) {
  const [isAlignmentMode, setIsAlignmentMode] = useState(defaultView === 'alignment');

  // Conditionally fetch actions based on projectId
  const actionsQuery = projectId
    ? api.action.getProjectActions.useQuery({ projectId })
    : api.action.getAll.useQuery(); // Consider using getToday for specific views if needed

  const actions = actionsQuery.data; // Extract data from the chosen query

  // Bulk update mutation for rescheduling
  const bulkUpdateMutation = api.action.update.useMutation();

  // Handle overdue bulk reschedule (non-project pages only)
  const handleOverdueBulkReschedule = (date: Date | null, actionIds: string[]) => {
    if (actionIds.length === 0) return;
    
    // Update all selected actions one by one
    let completedCount = 0;
    const totalCount = actionIds.length;
    
    actionIds.forEach((actionId) => {
      bulkUpdateMutation.mutate({
        id: actionId,
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
            void actionsQuery.refetch();
          }
        },
        onError: () => {
          notifications.show({
            title: 'Update Failed',
            message: `Failed to update action ${actionId}`,
            color: 'red',
          });
        }
      });
    });
  };

  // Bulk delete mutation for overdue actions (non-project pages only)
  const bulkDeleteMutation = api.action.bulkDelete.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Overdue Actions Deleted',
        message: `Successfully deleted ${data.count} overdue actions`,
        color: 'green',
      });
      void actionsQuery.refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Delete Failed',
        message: error.message || 'Failed to delete overdue actions',
        color: 'red',
      });
    },
  });

  // Handle overdue bulk delete (non-project pages only)
  const handleOverdueBulkAction = (action: 'delete', actionIds: string[]) => {
    if (action === 'delete') {
      bulkDeleteMutation.mutate({
        actionIds,
      });
    }
  };






  
  // Use the appropriate query based on whether we have a projectId
  const outcomes = projectId 
    ? api.outcome.getProjectOutcomes.useQuery(
        { projectId },
        {
          refetchOnWindowFocus: true,
          staleTime: 0
        }
      )
    : api.outcome.getMyOutcomes.useQuery(undefined, {
        refetchOnWindowFocus: true,
        staleTime: 0
      });

  console.log("outcomes are ", outcomes.data);
  useEffect(() => {
    setIsAlignmentMode(defaultView === 'alignment');
  }, [defaultView]);

  console.log("outcomes are ", outcomes.data);
  // Filter outcomes for today
  const todayOutcomes = outcomes.data?.filter(outcome => {
    if (!outcome.dueDate) return false;
    const dueDate = new Date(outcome.dueDate);
    const today = new Date();
    return (
      dueDate.getDate() === today.getDate() &&
      dueDate.getMonth() === today.getMonth() &&
      dueDate.getFullYear() === today.getFullYear()
    );
  });

  // Filter outcomes for this week (excluding today)
  const weeklyOutcomes = outcomes.data?.filter(outcome => {
    if (!outcome.dueDate) return false;
    const dueDate = new Date(outcome.dueDate);
    const today = new Date();
    const endOfWeek = new Date();
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    
    return (
      dueDate > today &&
      dueDate <= endOfWeek &&
      !(dueDate.getDate() === today.getDate() &&
        dueDate.getMonth() === today.getMonth() &&
        dueDate.getFullYear() === today.getFullYear())
    );
  });

  // Add debugging for filtered outcomes
  useEffect(() => {
    console.log('📊 Today outcomes:', todayOutcomes);
    console.log('📊 Weekly outcomes:', weeklyOutcomes);
  }, [todayOutcomes, weeklyOutcomes]);




  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Alignment View Toggle - moved to standalone button */}
      {displayAlignment && (
        <Paper withBorder radius="sm" mb="md" p="md">
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              View Options
            </Text>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setIsAlignmentMode(!isAlignmentMode)}
            >
              <Group gap="xs">
                {isAlignmentMode ? <IconList size={16} /> : <IconLayoutKanban size={16} />}
                {isAlignmentMode ? 'Task View' : 'Alignment View'}
              </Group>
            </Button>
          </Group>
        </Paper>
      )}

      {isAlignmentMode && (
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-surface-secondary border border-border-primary">
          <Stack gap="md">
          <Group>
            <Title order={2} className="text-2xl">
              Today&apos;s theme is ...
            </Title>
          </Group>
            <Title order={2} className="text-xl bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              What will make today great?
            </Title>
            <Stack gap="xs">
              {todayOutcomes?.map((outcome) => (
                <CreateOutcomeModal
                  key={outcome.id}
                  outcome={{
                    id: outcome.id,
                    description: outcome.description,
                    dueDate: outcome.dueDate,
                    type: (outcome.type || 'daily') as OutcomeType,
                    projectId: outcome.projects[0]?.id
                  }}
                  projectId={projectId}
                  trigger={
                    <Paper p="sm" className="bg-surface-primary cursor-pointer hover:bg-surface-hover transition-colors">
                      <Text>{outcome.description}</Text>
                    </Paper>
                  }
                />
              ))}
              {(!todayOutcomes || todayOutcomes.length === 0) && (
                <Text c="dimmed" size="sm" style={{ fontStyle: 'italic' }}>
                  No outcomes set for today. Add some in your morning routine.
                </Text>
              )}
            </Stack>
          </Stack>
          
        </Paper>
      )}

      {isAlignmentMode && (
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-surface-secondary border border-border-primary">
          <Stack gap="md">
            <Title order={2} className="text-xl bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
              What would make this week great?
            </Title>
            <Stack gap="xs">
              {weeklyOutcomes?.map((outcome) => (
                <CreateOutcomeModal
                  key={outcome.id}
                  outcome={{
                    id: outcome.id,
                    description: outcome.description,
                    dueDate: outcome.dueDate,
                    type: (outcome.type || 'daily') as OutcomeType,
                    projectId: outcome.projects[0]?.id
                  }}
                  projectId={projectId}
                  trigger={
                    <Paper p="sm" className="bg-surface-primary cursor-pointer hover:bg-surface-hover transition-colors">
                      <Group justify="space-between">
                        <Text>{outcome.description}</Text>
                        <Text size="sm" c="dimmed">
                          {new Date(outcome.dueDate!).toLocaleDateString(undefined, { weekday: 'short' })}
                        </Text>
                      </Group>
                    </Paper>
                  }
                />
              ))}
              {(!weeklyOutcomes || weeklyOutcomes.length === 0) && (
                <Text c="dimmed" size="sm" style={{ fontStyle: 'italic' }}>
                  No outcomes set for this week. Plan your week in your morning routine.
                </Text>
              )}
            </Stack>
          </Stack>
         
        </Paper>
      )}
      {isAlignmentMode && (
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-surface-secondary border border-border-primary">
           <CreateGoalModal projectId={projectId}>
              <Button 
                variant="filled" 
                color="dark"
                leftSection="+"
              >
                Add Goal
              </Button>
            </CreateGoalModal>
            <br/>
            <CreateOutcomeModal projectId={projectId}>
            <Button 
              variant="filled" 
              color="dark"
              leftSection="+"
            >
              Add Outcome
            </Button>
          </CreateOutcomeModal>
        </Paper>
      )}
      
      {/* Pass the fetched actions data to ActionList */}
      <ActionList 
        viewName={viewName} 
        actions={actions ?? []} 
        enableBulkEditForOverdue={!projectId} // Only enable for non-project pages
        onOverdueBulkAction={!projectId ? handleOverdueBulkAction : undefined}
        onOverdueBulkReschedule={!projectId ? handleOverdueBulkReschedule : undefined}
      />
      <div className="mt-6">
        <CreateActionModal viewName={viewName} projectId={projectId}/>
      </div>
    </div>
  );
} 