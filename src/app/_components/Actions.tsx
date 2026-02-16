"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';
import { KanbanBoard } from './KanbanBoard';
import { IconLayoutKanban, IconList, IconBrandNotion, IconRefresh, IconFilterOff, IconTag } from "@tabler/icons-react";
import { Button, Title, Stack, Paper, Text, Group, ActionIcon, Tooltip, Badge, MultiSelect } from "@mantine/core";
import { useState, useEffect, useMemo } from "react";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { notifications } from "@mantine/notifications";
import type { SchedulingSuggestionData } from "./SchedulingSuggestion";
import { useActionDeepLink } from "~/hooks/useActionDeepLink";

type OutcomeType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'life' | 'problem';

interface ActionsProps {
  viewName: string;
  defaultView?: 'list' | 'alignment' | 'kanban';
  projectId?: string;
  displayAlignment?: boolean;
  /** Project sync info for showing Notion sync button */
  projectSyncInfo?: {
    taskManagementTool?: string | null;
    taskManagementConfig?: {
      workflowId?: string;
      syncStrategy?: 'manual' | 'auto_pull_then_push' | 'notion_canonical';
    } | null;
  };
}

export function Actions({ viewName, defaultView = 'list', projectId, displayAlignment = false, projectSyncInfo }: ActionsProps) {
  const [isAlignmentMode, setIsAlignmentMode] = useState(defaultView === 'alignment');
  const [isKanbanMode, setIsKanbanMode] = useState(defaultView === 'kanban');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showNotionUnassigned, setShowNotionUnassigned] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const utils = api.useUtils();
  const { actionIdFromUrl, setActionId, clearActionId } = useActionDeepLink();

  // Query available tags for filtering
  const tagsQuery = api.tag.list.useQuery();
  const tagOptions = useMemo(() => 
    tagsQuery.data?.allTags?.map((tag: { id: string; name: string }) => ({ value: tag.id.toString(), label: tag.name })) ?? []
  , [tagsQuery.data]);

  // Check if this project has a Notion integration
  const hasNotionSync = projectSyncInfo?.taskManagementTool === 'notion' &&
    projectSyncInfo?.taskManagementConfig?.workflowId;

  // Query for Notion imports without project (only fetch when filter is active or to get count)
  const notionUnassignedQuery = api.action.getNotionImportedWithoutProject.useQuery(
    undefined,
    { enabled: !projectId } // Only enable on non-project pages
  );

  // Smart sync mutation for Notion
  const smartSyncMutation = api.workflow.smartSync.useMutation({
    onSuccess: (data) => {
      setIsSyncing(false);
      const totalCreated = data.itemsCreated ?? 0;
      const totalUpdated = data.itemsUpdated ?? 0;

      let message = '';
      if (totalCreated > 0 || totalUpdated > 0) {
        if (totalCreated > 0) message += `${totalCreated} created`;
        if (totalUpdated > 0) message += `${message ? ', ' : ''}${totalUpdated} updated`;
      } else {
        message = 'Everything up to date';
      }

      notifications.show({
        title: 'Notion Sync Complete',
        message,
        color: 'green',
        autoClose: 3000,
      });

      // Refresh actions
      void utils.action.getProjectActions.invalidate({ projectId: projectId! });
    },
    onError: (error) => {
      setIsSyncing(false);
      notifications.show({
        title: 'Sync Failed',
        message: error.message ?? 'Failed to sync with Notion',
        color: 'red',
      });
    },
  });

  const handleNotionSync = () => {
    if (!projectId || !hasNotionSync) return;
    setIsSyncing(true);
    smartSyncMutation.mutate({ projectId });
  };

  // Conditionally fetch actions based on projectId
  const allActionsQuery = api.action.getAll.useQuery(undefined, { enabled: !projectId });
  const projectActionsQuery = api.action.getProjectActions.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Filter Notion unassigned to only show items scheduled for today with ACTIVE status
  const notionUnassignedTodayData = useMemo(() => {
    if (!notionUnassignedQuery.data) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return notionUnassignedQuery.data.filter(action => {
      // Must be ACTIVE status
      if (action.status !== 'ACTIVE') return false;
      // Must be scheduled for today
      if (!action.scheduledStart) return false;
      const scheduledDate = new Date(action.scheduledStart);
      scheduledDate.setHours(0, 0, 0, 0);
      return scheduledDate.getTime() === today.getTime();
    });
  }, [notionUnassignedQuery.data]);

  // Use filtered results if Notion unassigned filter is active, otherwise use normal query
  // All three queries return the same shape, so we can safely union them
  const actionsBeforeTagFilter = projectId
    ? projectActionsQuery.data
    : (showNotionUnassigned ? notionUnassignedTodayData : allActionsQuery.data);

  // Apply tag filter if tags are selected
  const actions = useMemo(() => {
    if (!actionsBeforeTagFilter || selectedTagIds.length === 0) return actionsBeforeTagFilter;
    return actionsBeforeTagFilter.filter(action => 
      action.tags?.some(actionTag => selectedTagIds.includes(actionTag.tagId.toString()))
    );
  }, [actionsBeforeTagFilter, selectedTagIds]);

  // Count of unassigned Notion imports for today (for badge)
  const notionUnassignedCount = notionUnassignedTodayData.length;

  // State for dismissed scheduling suggestions
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const [applyingSuggestionId, setApplyingSuggestionId] = useState<string | null>(null);

  // Determine if we have overdue actions (for enabling scheduling suggestions query)
  const hasOverdueActions = useMemo(() => {
    if (!actions) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return actions.some(action => {
      if (!action.scheduledStart || action.status !== 'ACTIVE') return false;
      const scheduledDate = new Date(action.scheduledStart);
      scheduledDate.setHours(0, 0, 0, 0);
      return scheduledDate < today;
    });
  }, [actions]);

  // Query for AI scheduling suggestions (only for non-project "today" view with overdue actions)
  const shouldFetchSchedulingSuggestions = !projectId && viewName.toLowerCase() === 'today' && hasOverdueActions;
  const schedulingSuggestionsQuery = api.scheduling.getSchedulingSuggestions.useQuery(
    { days: 7 },
    {
      enabled: shouldFetchSchedulingSuggestions,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      refetchOnWindowFocus: false,
    }
  );

  // Filter out dismissed suggestions and create a map by actionId
  const schedulingSuggestionsMap = useMemo(() => {
    const map = new Map<string, SchedulingSuggestionData>();
    if (schedulingSuggestionsQuery.data?.suggestions) {
      for (const suggestion of schedulingSuggestionsQuery.data.suggestions) {
        if (!dismissedSuggestionIds.has(suggestion.actionId)) {
          map.set(suggestion.actionId, suggestion);
        }
      }
    }
    return map;
  }, [schedulingSuggestionsQuery.data?.suggestions, dismissedSuggestionIds]);

  // Handler for applying a scheduling suggestion
  const handleApplySchedulingSuggestion = async (actionId: string, suggestedDate: string, suggestedTime: string) => {
    setApplyingSuggestionId(actionId);
    try {
      // Parse the date and time
      const [hours, minutes] = suggestedTime.split(':').map(Number);
      const scheduledStart = new Date(suggestedDate + 'T00:00:00');
      scheduledStart.setHours(hours ?? 9, minutes ?? 0, 0, 0);

      const dueDate = new Date(suggestedDate + 'T00:00:00');

      await bulkUpdateMutation.mutateAsync({
        id: actionId,
        dueDate,
        scheduledStart,
      });

      // Remove the suggestion after applying
      setDismissedSuggestionIds(prev => new Set([...prev, actionId]));

      notifications.show({
        title: 'Task Scheduled',
        message: `Scheduled for ${scheduledStart.toLocaleDateString()} at ${suggestedTime}`,
        color: 'green',
        autoClose: 3000,
      });
    } catch (error) {
      notifications.show({
        title: 'Failed to Schedule',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    } finally {
      setApplyingSuggestionId(null);
    }
  };

  // Handler for dismissing a scheduling suggestion
  const handleDismissSchedulingSuggestion = (actionId: string) => {
    setDismissedSuggestionIds(prev => new Set([...prev, actionId]));
  };

  // Bulk update mutation for rescheduling
  const bulkUpdateMutation = api.action.update.useMutation({
    onMutate: async ({ id, dueDate }) => {
      const mutationStartTime = Date.now();
      console.log(`🔧 [MUTATION DEBUG] onMutate started for action ${id}:`, {
        actionId: id,
        newDueDate: dueDate?.toISOString() || null,
        timestamp: new Date().toISOString()
      });

      // Cancel any outgoing refetches
      await utils.action.getAll.cancel();
      console.log(`🔧 [MUTATION DEBUG] Cancelled outgoing refetches for action ${id}`);
      
      // Get current data
      const previousData = utils.action.getAll.getData();
      const currentAction = previousData?.find(action => action.id === id);
      
      console.log(`🔧 [MUTATION DEBUG] Current cache state for action ${id}:`, {
        actionFound: !!currentAction,
        currentDueDate: currentAction?.dueDate?.toISOString() || null,
        actionName: currentAction?.name,
        totalCacheSize: previousData?.length
      });
      
      // Optimistically update the cache
      if (previousData) {
        utils.action.getAll.setData(undefined, (old) => {
          if (!old) {
            console.log(`🔧 [MUTATION DEBUG] No old cache data for action ${id}, returning empty array`);
            return [];
          }
          
          const updated = old.map((action) =>
            action.id === id
              ? { ...action, dueDate: dueDate ?? null }
              : action
          );
          
          const updatedAction = updated.find(action => action.id === id);
          console.log(`🔧 [MUTATION DEBUG] Optimistic update applied for action ${id}:`, {
            found: !!updatedAction,
            oldDueDate: currentAction?.dueDate?.toISOString() || null,
            newDueDate: updatedAction?.dueDate?.toISOString() || null,
            mutationDuration: Date.now() - mutationStartTime + 'ms'
          });
          
          return updated;
        });
      } else {
        console.log(`🔧 [MUTATION DEBUG] No previous data found in cache for action ${id}`);
      }
      
      console.log(`🔧 [MUTATION DEBUG] onMutate completed for action ${id}, duration:`, Date.now() - mutationStartTime + 'ms');
      return { previousData, actionId: id, mutationStartTime };
    },
    onError: (err, variables, context) => {
      const errorTime = Date.now();
      const duration = context?.mutationStartTime ? errorTime - context.mutationStartTime : 0;
      
      console.error(`🔧 [MUTATION DEBUG] onError for action ${variables.id}:`, {
        error: err.message || 'Unknown error',
        actionId: variables.id,
        duration: duration + 'ms',
        hadPreviousData: !!context?.previousData
      });

      // Rollback on error
      if (context?.previousData) {
        utils.action.getAll.setData(undefined, context.previousData);
        console.log(`🔧 [MUTATION DEBUG] Rollback completed for action ${variables.id}`);
      }
      
      notifications.show({
        title: 'Update Failed',
        message: `Failed to update action ${variables.id}: ${err.message || 'Unknown error'}`,
        color: 'red',
      });
    },
    onSettled: (data, error, variables, context) => {
      const settledTime = Date.now();
      const duration = context?.mutationStartTime ? settledTime - context.mutationStartTime : 0;
      
      console.log(`🔧 [MUTATION DEBUG] onSettled for action ${variables.id}:`, {
        success: !error,
        error: error?.message || null,
        actionId: variables.id,
        totalDuration: duration + 'ms',
        data: data ? { id: data.id, dueDate: data.dueDate?.toISOString() } : null
      });

      // Always refetch after error or success
      console.log(`🔧 [MUTATION DEBUG] Starting invalidation for action ${variables.id}`);
      void utils.action.getAll.invalidate();
      void utils.action.getToday.invalidate();
    },
  });

  // Bulk reschedule mutation - single API call for multiple actions
  const bulkRescheduleMutation = api.action.bulkReschedule.useMutation({
    onMutate: async ({ actionIds, dueDate }) => {
      await utils.action.getAll.cancel();
      const previousData = utils.action.getAll.getData();

      // Optimistically update ALL selected actions at once (scheduledStart + dueDate)
      if (previousData) {
        utils.action.getAll.setData(undefined, (old) => {
          if (!old) return [];
          return old.map((action) => {
            if (!actionIds.includes(action.id)) return action;
            const newScheduledStart = dueDate ?? null;
            // Update dueDate only if it's before the new date or null
            const newDueDate = dueDate
              ? (!action.dueDate || action.dueDate < dueDate ? dueDate : action.dueDate)
              : null;
            return { ...action, scheduledStart: newScheduledStart, dueDate: newDueDate };
          });
        });
      }

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        utils.action.getAll.setData(undefined, context.previousData);
      }
    },
    onSettled: () => {
      void utils.action.getAll.invalidate();
      void utils.action.getToday.invalidate();
    },
  });

  // Fetch projects for bulk assignment dropdown
  const projectsQuery = api.project.getAll.useQuery();

  // Bulk assign project mutation
  const bulkAssignProjectMutation = api.action.bulkAssignProject.useMutation({
    onMutate: async ({ actionIds, projectId: newProjectId }) => {
      await utils.action.getAll.cancel();
      const previousData = utils.action.getAll.getData();

      if (previousData) {
        utils.action.getAll.setData(undefined, (old) => {
          if (!old) return [];
          return old.map((action) =>
            actionIds.includes(action.id)
              ? { ...action, projectId: newProjectId }
              : action
          );
        });
      }

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        utils.action.getAll.setData(undefined, context.previousData);
      }
    },
    onSettled: () => {
      void utils.action.getAll.invalidate();
      void utils.action.getToday.invalidate();
    },
  });

  // Handle overdue bulk reschedule (non-project pages only)
  const handleOverdueBulkReschedule = async (date: Date | null, actionIds: string[]) => {
    if (actionIds.length === 0) return;

    const totalCount = actionIds.length;

    notifications.show({
      id: 'bulk-reschedule',
      title: 'Rescheduling...',
      message: `Updating ${totalCount} action${totalCount !== 1 ? 's' : ''}...`,
      loading: true,
      autoClose: false,
    });

    try {
      const result = await bulkRescheduleMutation.mutateAsync({
        actionIds,
        dueDate: date,
      });

      const message = date
        ? `Rescheduled ${result.count} action${result.count !== 1 ? 's' : ''} to ${date.toDateString()}`
        : `Removed due date from ${result.count} action${result.count !== 1 ? 's' : ''}`;

      notifications.update({
        id: 'bulk-reschedule',
        title: date ? 'Bulk Reschedule Complete' : 'Due Date Removed',
        message,
        color: 'green',
        loading: false,
        autoClose: 3000,
      });

      // Invalidate project actions if on project page
      if (projectId) {
        void utils.action.getProjectActions.invalidate({ projectId });
      }
    } catch (error) {
      notifications.update({
        id: 'bulk-reschedule',
        title: 'Bulk Update Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
        loading: false,
        autoClose: 5000,
      });
    }
  };

  // Bulk delete mutation for overdue actions (non-project pages only)
  const bulkDeleteMutation = api.action.bulkDelete.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Overdue Actions Deleted',
        message: `Successfully deleted ${data.count} overdue actions`,
        color: 'green',
      });
      // Refetch the appropriate query
      if (projectId) {
        void projectActionsQuery.refetch();
      } else {
        void allActionsQuery.refetch();
        void notionUnassignedQuery.refetch();
      }
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

  // Handle project bulk delete
  const handleProjectBulkDelete = (actionIds: string[]) => {
    bulkDeleteMutation.mutate({
      actionIds,
    });
  };

  // Helper to detect focus views (today, this week, this month)
  const isFocusView = (name: string) => {
    const focusViews = ['today', 'this-week', 'this-month', 'tomorrow'];
    return focusViews.includes(name.toLowerCase());
  };

  // Handle focus view bulk reschedule (today, this week, this month)
  const handleFocusBulkReschedule = async (date: Date | null, actionIds: string[]) => {
    if (actionIds.length === 0) return;

    const totalCount = actionIds.length;

    notifications.show({
      id: 'bulk-reschedule-focus',
      title: 'Rescheduling...',
      message: `Updating ${totalCount} action${totalCount !== 1 ? 's' : ''}...`,
      loading: true,
      autoClose: false,
    });

    try {
      const result = await bulkRescheduleMutation.mutateAsync({
        actionIds,
        dueDate: date,
      });

      notifications.update({
        id: 'bulk-reschedule-focus',
        title: 'Rescheduled',
        message: `Successfully updated ${result.count} action${result.count !== 1 ? 's' : ''}`,
        loading: false,
        autoClose: 3000,
        color: 'green',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Bulk reschedule error:', err);

      notifications.update({
        id: 'bulk-reschedule-focus',
        title: 'Error',
        message: `Failed to reschedule: ${errMsg}`,
        loading: false,
        autoClose: 5000,
        color: 'red',
      });
    }
  };

  // Handle focus view bulk delete
  const handleFocusBulkDelete = (actionIds: string[]) => {
    bulkDeleteMutation.mutate({
      actionIds,
    });
  };

  // Handle inbox bulk schedule (assign due date to untriaged actions)
  const handleInboxBulkSchedule = async (date: Date | null, actionIds: string[]) => {
    if (actionIds.length === 0) return;

    const totalCount = actionIds.length;

    notifications.show({
      id: 'bulk-schedule-inbox',
      title: 'Scheduling...',
      message: `Updating ${totalCount} action${totalCount !== 1 ? 's' : ''}...`,
      loading: true,
      autoClose: false,
    });

    try {
      const result = await bulkRescheduleMutation.mutateAsync({
        actionIds,
        dueDate: date,
      });

      notifications.update({
        id: 'bulk-schedule-inbox',
        title: 'Scheduled',
        message: `Successfully updated ${result.count} action${result.count !== 1 ? 's' : ''}`,
        loading: false,
        autoClose: 3000,
        color: 'green',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Bulk schedule error:', err);

      notifications.update({
        id: 'bulk-schedule-inbox',
        title: 'Error',
        message: `Failed to schedule: ${errMsg}`,
        loading: false,
        autoClose: 5000,
        color: 'red',
      });
    }
  };

  // Handle inbox bulk delete
  const handleInboxBulkDelete = async (actionIds: string[]) => {
    bulkDeleteMutation.mutate({
      actionIds,
    });
  };

  // Handle inbox bulk assign to project
  const handleInboxBulkAssignProject = async (projectId: string, actionIds: string[]) => {
    if (actionIds.length === 0) return;

    const totalCount = actionIds.length;
    const projectName = projectsQuery.data?.find(p => p.id === projectId)?.name ?? 'project';

    notifications.show({
      id: 'bulk-assign-project',
      title: 'Assigning to project...',
      message: `Updating ${totalCount} action${totalCount !== 1 ? 's' : ''}...`,
      loading: true,
      autoClose: false,
    });

    try {
      const result = await bulkAssignProjectMutation.mutateAsync({
        actionIds,
        projectId,
      });

      notifications.update({
        id: 'bulk-assign-project',
        title: 'Project Assigned',
        message: `Successfully assigned ${result.count} action${result.count !== 1 ? 's' : ''} to ${projectName}`,
        loading: false,
        autoClose: 3000,
        color: 'green',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      notifications.update({
        id: 'bulk-assign-project',
        title: 'Error',
        message: `Failed to assign project: ${errMsg}`,
        loading: false,
        autoClose: 5000,
        color: 'red',
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

  useEffect(() => {
    setIsAlignmentMode(defaultView === 'alignment');
    setIsKanbanMode(defaultView === 'kanban');
  }, [defaultView]);
  // Filter outcomes for today
  const todayOutcomes = outcomes.data?.filter((outcome: any) => {
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
  const weeklyOutcomes = outcomes.data?.filter((outcome: any) => {
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
    <div className="w-full  mx-auto">
      {/* View Toggle Buttons */}
      {projectId && (
        <Group gap="xs" mb="md" justify="space-between">
          <Group gap="xs">
            {/* List/Kanban toggle - only show for projects */}
            <Button
              variant={!isKanbanMode ? "filled" : "subtle"}
              size="sm"
              onClick={() => setIsKanbanMode(false)}
            >
              <Group gap="xs">
                <IconList size={16} />
                List
              </Group>
            </Button>
            <Button
              variant={isKanbanMode ? "filled" : "subtle"}
              size="sm"
              onClick={() => setIsKanbanMode(true)}
            >
              <Group gap="xs">
                <IconLayoutKanban size={16} />
                Kanban
              </Group>
            </Button>

            {/* Alignment toggle */}
            {displayAlignment && (
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
            )}
          </Group>

          {/* Notion Sync Button - only show when project has Notion integration */}
          {hasNotionSync && (
            <Group gap="xs">
              <Tooltip label="Sync with Notion" position="left">
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="lg"
                  onClick={handleNotionSync}
                  loading={isSyncing}
                >
                  <IconBrandNotion size={20} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Refresh from Notion" position="left">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={handleNotionSync}
                  loading={isSyncing}
                >
                  <IconRefresh size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>
      )}

      {/* Filter for Notion imports without project - only show on non-project pages */}
      {!projectId && notionUnassignedCount > 0 && (
        <Group gap="xs" mb="md">
          <Tooltip label={showNotionUnassigned ? "Show all actions" : "Show Notion imports without a project"}>
            <Button
              variant={showNotionUnassigned ? "filled" : "light"}
              size="sm"
              color={showNotionUnassigned ? "violet" : "gray"}
              onClick={() => setShowNotionUnassigned(!showNotionUnassigned)}
              leftSection={<IconBrandNotion size={16} />}
              rightSection={
                <Badge size="sm" variant="filled" color={showNotionUnassigned ? "white" : "violet"}>
                  {notionUnassignedCount}
                </Badge>
              }
            >
              {showNotionUnassigned ? "Showing Unassigned" : "Notion Unassigned"}
            </Button>
          </Tooltip>
          {showNotionUnassigned && (
            <Button
              variant="subtle"
              size="sm"
              color="gray"
              onClick={() => setShowNotionUnassigned(false)}
              leftSection={<IconFilterOff size={16} />}
            >
              Clear Filter
            </Button>
          )}
        </Group>
      )}

      {/* Tag filter - available on all non-project pages */}
      {!projectId && tagOptions.length > 0 && (
        <Group gap="xs" mb="md" align="flex-end">
          <MultiSelect
            data={tagOptions}
            value={selectedTagIds}
            onChange={setSelectedTagIds}
            placeholder="Filter by tags..."
            leftSection={<IconTag size={16} />}
            clearable
            searchable
            size="sm"
            maxDropdownHeight={200}
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                borderColor: 'var(--color-border-primary)',
                minWidth: 200,
              },
              dropdown: {
                backgroundColor: 'var(--color-surface-secondary)',
                borderColor: 'var(--color-border-primary)',
              },
            }}
          />
          {selectedTagIds.length > 0 && (
            <Button
              variant="subtle"
              size="sm"
              color="gray"
              onClick={() => setSelectedTagIds([])}
              leftSection={<IconFilterOff size={16} />}
            >
              Clear Tags
            </Button>
          )}
        </Group>
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
              {todayOutcomes?.map((outcome: any) => (
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
              {weeklyOutcomes?.map((outcome: any) => (
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
                          {new Date(outcome.dueDate).toLocaleDateString(undefined, { weekday: 'short' })}
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
      
      {/* Conditional rendering of List or Kanban view */}
      {projectId && isKanbanMode ? (
        <KanbanBoard 
          projectId={projectId}
          actions={actions ?? []} 
        />
      ) : (
        <ActionList
          viewName={showNotionUnassigned ? "notion-unassigned" : viewName}
          actions={actions ?? []}
          showProject={!projectId}
          enableBulkEditForOverdue={true}
          onOverdueBulkAction={handleOverdueBulkAction}
          onOverdueBulkReschedule={handleOverdueBulkReschedule}
          enableBulkEditForProject={!!projectId}
          onProjectBulkDelete={handleProjectBulkDelete}
          enableBulkEditForFocus={!projectId && isFocusView(viewName)}
          onFocusBulkDelete={handleFocusBulkDelete}
          onFocusBulkReschedule={handleFocusBulkReschedule}
          enableBulkEditForInbox={viewName.toLowerCase() === 'inbox'}
          onInboxBulkSchedule={handleInboxBulkSchedule}
          onInboxBulkDelete={handleInboxBulkDelete}
          onInboxBulkAssignProject={handleInboxBulkAssignProject}
          schedulingSuggestions={schedulingSuggestionsMap}
          schedulingSuggestionsLoading={schedulingSuggestionsQuery.isLoading}
          _schedulingSuggestionsError={schedulingSuggestionsQuery.error?.message}
          _calendarConnected={schedulingSuggestionsQuery.data?.calendarConnected}
          onApplySchedulingSuggestion={handleApplySchedulingSuggestion}
          onDismissSchedulingSuggestion={handleDismissSchedulingSuggestion}
          applyingSuggestionId={applyingSuggestionId}
          isLoading={projectId ? projectActionsQuery.isLoading : allActionsQuery.isLoading}
          deepLinkActionId={actionIdFromUrl}
          onActionOpen={setActionId}
          onActionClose={clearActionId}
        />
      )}
      <div className="mt-6">
        <CreateActionModal viewName={viewName} projectId={projectId}/>
      </div>
    </div>
  );
} 