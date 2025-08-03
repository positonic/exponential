"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';
import { IconLayoutKanban, IconList, IconCalendarEvent, IconUpload, IconDownload, IconSettings, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { Button, Title, Stack, Paper, Text, Group, ActionIcon, Switch, Tooltip, Badge } from "@mantine/core";
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
  onToggleSyncStatus?: () => void;
}

export function Actions({ viewName, defaultView = 'list', projectId, displayAlignment = true, onToggleSyncStatus }: ActionsProps) {
  const [isAlignmentMode, setIsAlignmentMode] = useState(defaultView === 'alignment');
  const [syncingToIntegration, setSyncingToIntegration] = useState(false);
  const [pullingFromIntegration, setPullingFromIntegration] = useState(false);
  const [exponentialIsSourceOfTruth, setExponentialIsSourceOfTruth] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
  const [syncConfigExpanded, setSyncConfigExpanded] = useState(false);

  // Conditionally fetch actions based on projectId
  const actionsQuery = projectId
    ? api.action.getProjectActions.useQuery({ projectId })
    : api.action.getAll.useQuery(); // Consider using getToday for specific views if needed

  const actions = actionsQuery.data; // Extract data from the chosen query

  // Get project data if we have a projectId to check task management configuration
  const { data: project } = api.project.getById.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );

  // Get available workflows
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const utils = api.useUtils();

  // Bulk delete mutation
  const bulkDeleteMutation = api.action.bulkDelete.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Actions Deleted',
        message: `Successfully deleted ${data.count} actions`,
        color: 'green',
      });
      setSelectedActionIds(new Set());
      void actionsQuery.refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Delete Failed',
        message: error.message || 'Failed to delete actions',
        color: 'red',
      });
    },
  });

  // Sync to integration mutation (push)
  const syncToIntegrationMutation = api.workflow.run.useMutation({
    onSuccess: (data) => {
      setSyncingToIntegration(false);
      
      const integrationName = project?.taskManagementTool === 'monday' ? 'Monday.com' : 
                             project?.taskManagementTool === 'notion' ? 'Notion' : 
                             project?.taskManagementTool;
      const itemsCreated = data.itemsCreated || 0;
      const itemsSkipped = data.itemsSkipped || 0;
      const totalProcessed = data.itemsProcessed || 0;
      
      let message = '';
      let color: 'green' | 'yellow' | 'blue' = 'green';
      
      // Determine the main message based on what happened
      if (itemsCreated === 0 && itemsSkipped > 0) {
        // Nothing was created, only skipped
        message = `ℹ️ No new tasks to sync to ${integrationName}`;
        color = 'blue';
        
        // Group skip reasons by type
        const metadata = data as any;
        const skipReasonGroups: Record<string, number> = {};
        
        if (metadata.skippedReasons && Array.isArray(metadata.skippedReasons)) {
          metadata.skippedReasons.forEach((reason: string) => {
            // Extract the reason type from the full message
            if (reason.includes('Already synced')) {
              skipReasonGroups.already_synced = (skipReasonGroups.already_synced || 0) + 1;
            } else if (reason.includes('Deleted from Notion')) {
              skipReasonGroups.deleted_remotely = (skipReasonGroups.deleted_remotely || 0) + 1;
            } else if (reason.includes('Failed')) {
              skipReasonGroups.failed = (skipReasonGroups.failed || 0) + 1;
            } else {
              skipReasonGroups.other = (skipReasonGroups.other || 0) + 1;
            }
          });
        }
        
        // Build grouped skip message
        if (skipReasonGroups.already_synced && skipReasonGroups.already_synced > 0) {
          message += `\n✓ ${skipReasonGroups.already_synced} already synced`;
        }
        if (skipReasonGroups.deleted_remotely && skipReasonGroups.deleted_remotely > 0) {
          message += `\n🗑️ ${skipReasonGroups.deleted_remotely} deleted from ${integrationName}`;
        }
        if (skipReasonGroups.failed && skipReasonGroups.failed > 0) {
          message += `\n⚠️ ${skipReasonGroups.failed} failed to sync`;
        }
        if (skipReasonGroups.other && skipReasonGroups.other > 0) {
          message += `\n• ${skipReasonGroups.other} skipped (other reasons)`;
        }
        
        // Show detailed skip reasons if user wants more info
        if (metadata.skippedReasons && metadata.skippedReasons.length <= 3) {
          message += '\n\n📋 Details:';
          metadata.skippedReasons.forEach((reason: string) => {
            message += `\n• ${reason}`;
          });
        }
      } else {
        // Some items were created
        message = `✅ ${itemsCreated} task${itemsCreated !== 1 ? 's' : ''} synced to ${integrationName}`;
        
        if (itemsSkipped > 0) {
          // Group skip reasons for created + skipped scenario too
          const metadata = data as any;
          const skipReasonGroups: Record<string, number> = {};
          
          if (metadata.skippedReasons && Array.isArray(metadata.skippedReasons)) {
            metadata.skippedReasons.forEach((reason: string) => {
              if (reason.includes('Already synced')) {
                skipReasonGroups.already_synced = (skipReasonGroups.already_synced || 0) + 1;
              } else if (reason.includes('Deleted from Notion')) {
                skipReasonGroups.deleted_remotely = (skipReasonGroups.deleted_remotely || 0) + 1;
              } else if (reason.includes('Failed')) {
                skipReasonGroups.failed = (skipReasonGroups.failed || 0) + 1;
              } else {
                skipReasonGroups.other = (skipReasonGroups.other || 0) + 1;
              }
            });
          }
          
          message += '\n\n⚠️ Skipped:';
          if (skipReasonGroups.already_synced && skipReasonGroups.already_synced > 0) {
            message += `\n• ${skipReasonGroups.already_synced} already synced`;
          }
          if (skipReasonGroups.deleted_remotely && skipReasonGroups.deleted_remotely > 0) {
            message += `\n• ${skipReasonGroups.deleted_remotely} deleted from ${integrationName}`;
          }
          if (skipReasonGroups.failed && skipReasonGroups.failed > 0) {
            message += `\n• ${skipReasonGroups.failed} failed`;
          }
          
          color = 'yellow';
        }
      }
      
      if (totalProcessed > 0) {
        message += `\n📊 ${totalProcessed} total task${totalProcessed !== 1 ? 's' : ''} processed`;
      }

      notifications.show({
        title: itemsCreated > 0 ? '🎉 Push Sync Complete!' : '✅ Sync Status',
        message: message,
        color: color,
        autoClose: 5000,
        withCloseButton: true,
      });
      
      // Refresh actions list
      void actionsQuery.refetch();
    },
    onError: (error) => {
      setSyncingToIntegration(false);
      notifications.show({
        title: '❌ Push Sync Failed',
        message: error.message || 'Failed to sync actions to integration',
        color: 'red',
        autoClose: 8000,
        withCloseButton: true,
      });
    },
  });

  // Pull from integration mutation
  const pullFromIntegrationMutation = api.workflow.run.useMutation({
    onSuccess: (data) => {
      setPullingFromIntegration(false);
      
      const integrationName = project?.taskManagementTool === 'monday' ? 'Monday.com' : 
                             project?.taskManagementTool === 'notion' ? 'Notion' : 
                             project?.taskManagementTool;
      const itemsCreated = data.itemsCreated || 0;
      const itemsUpdated = data.itemsUpdated || 0;
      const itemsSkipped = data.itemsSkipped || 0;
      const totalProcessed = data.itemsProcessed || 0;
      
      let message = `✅ ${itemsCreated} new task${itemsCreated !== 1 ? 's' : ''} imported from ${integrationName}`;
      
      if (itemsUpdated > 0) {
        message += `\n🔄 ${itemsUpdated} task${itemsUpdated !== 1 ? 's' : ''} updated`;
      }
      
      if (itemsSkipped > 0) {
        message += `\n⚠️ ${itemsSkipped} task${itemsSkipped !== 1 ? 's' : ''} skipped`;
      }
      
      if (totalProcessed > 0) {
        message += `\n📊 ${totalProcessed} total task${totalProcessed !== 1 ? 's' : ''} processed`;
      }

      notifications.show({
        title: '🎉 Pull Sync Complete!',
        message: message,
        color: 'blue',
        autoClose: 5000,
        withCloseButton: true,
      });
      
      // Refresh actions list
      void actionsQuery.refetch();
    },
    onError: (error) => {
      setPullingFromIntegration(false);
      notifications.show({
        title: '❌ Pull Sync Failed',
        message: error.message || 'Failed to pull actions from integration',
        color: 'red',
        autoClose: 8000,
        withCloseButton: true,
      });
    },
  });

  // Smart sync mutation
  const smartSyncMutation = api.workflow.smartSync.useMutation({
    onSuccess: (data) => {
      setPullingFromIntegration(false);
      setSyncingToIntegration(false);
      
      const integrationName = project?.taskManagementTool === 'monday' ? 'Monday.com' : 
                             project?.taskManagementTool === 'notion' ? 'Notion' : 
                             project?.taskManagementTool;
      
      const totalCreated = data.itemsCreated || 0;
      const totalUpdated = data.itemsUpdated || 0;
      const totalSkipped = data.itemsSkipped || 0;
      const totalProcessed = data.itemsProcessed || 0;
      const itemsAlreadySynced = data.itemsAlreadySynced || 0;
      const itemsFailedToSync = data.itemsFailedToSync || 0;
      
      let message = '';
      let color: 'green' | 'yellow' | 'blue' = 'green';
      
      // Build message based on results
      if (totalCreated === 0 && totalUpdated === 0 && totalSkipped > 0) {
        message = `ℹ️ No changes to sync with ${integrationName}`;
        color = 'blue';
        
        if (itemsAlreadySynced > 0) {
          message += `\n✓ ${itemsAlreadySynced} task${itemsAlreadySynced !== 1 ? 's' : ''} already up to date`;
        }
        if (itemsFailedToSync > 0) {
          message += `\n⚠️ ${itemsFailedToSync} task${itemsFailedToSync !== 1 ? 's' : ''} failed to sync`;
        }
      } else {
        if (totalCreated > 0) {
          message = `✅ ${totalCreated} task${totalCreated !== 1 ? 's' : ''} created/synced`;
        }
        
        if (totalUpdated > 0) {
          message += message ? '\n' : '';
          message += `🔄 ${totalUpdated} task${totalUpdated !== 1 ? 's' : ''} updated`;
        }
        
        if (totalSkipped > 0) {
          message += `\n⚠️ ${totalSkipped} task${totalSkipped !== 1 ? 's' : ''} skipped`;
          if (itemsAlreadySynced > 0) {
            message += ` (${itemsAlreadySynced} already synced)`;
          }
          color = totalCreated > 0 || totalUpdated > 0 ? 'yellow' : 'blue';
        }
      }
      
      if (totalProcessed > 0) {
        message += `\n📊 ${totalProcessed} total task${totalProcessed !== 1 ? 's' : ''} processed`;
      }
      
      // Show different messages based on sync strategy
      const strategy = data.syncStrategy;
      let title = '🎉 Smart Sync Complete!';
      
      if (strategy === 'notion_canonical') {
        title = '🎉 Notion Canonical Sync Complete!';
        message += `\n🎯 Notion was treated as the source of truth`;
      } else if (strategy === 'auto_pull_then_push') {
        title = '🎉 Smart Sync Complete!';
        message += `\n🔄 Pulled from ${integrationName} first, then pushed updates`;
      }

      notifications.show({
        title,
        message,
        color,
        autoClose: 6000,
        withCloseButton: true,
      });
      
      // Refresh actions list
      void actionsQuery.refetch();
    },
    onError: (error) => {
      setPullingFromIntegration(false);
      setSyncingToIntegration(false);
      notifications.show({
        title: '❌ Smart Sync Failed',
        message: error.message || 'Failed to run smart sync',
        color: 'red',
        autoClose: 8000,
        withCloseButton: true,
      });
    },
  });

  // Helper functions for bulk operations
  const handleSelectAll = () => {
    const allActionIds = actions?.map(action => action.id) || [];
    setSelectedActionIds(new Set(allActionIds));
  };

  const handleSelectNone = () => {
    setSelectedActionIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedActionIds.size === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedActionIds.size} actions?`)) {
      await bulkDeleteMutation.mutateAsync({
        actionIds: Array.from(selectedActionIds),
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

  // Handler for syncing actions to configured integration (push sync)
  const handleSyncToIntegration = () => {
    if (!project || !projectId) {
      notifications.show({
        title: 'Error',
        message: 'No project selected',
        color: 'red',
      });
      return;
    }

    if (!project.taskManagementTool || project.taskManagementTool === 'internal') {
      notifications.show({
        title: 'No Integration Configured',
        message: 'This project is not configured to use an external task management tool. Configure it in project settings.',
        color: 'orange',
      });
      return;
    }

    // Get the workflow ID from project configuration
    const workflowId = (project.taskManagementConfig as { workflowId?: string })?.workflowId;
    if (!workflowId) {
      notifications.show({
        title: 'Configuration Missing',
        message: `No ${project.taskManagementTool} workflow configured for this project. Please configure it in project settings.`,
        color: 'orange',
      });
      return;
    }

    // Verify the workflow exists and is active, and ensure it supports push
    const workflow = workflows.find(w => 
      w.id === workflowId && 
      w.provider === project.taskManagementTool && 
      w.status === 'ACTIVE' &&
      (w.syncDirection === 'push' || w.syncDirection === 'bidirectional')
    );

    if (!workflow) {
      notifications.show({
        title: 'Workflow Not Found',
        message: `The configured ${project.taskManagementTool} workflow is no longer available, active, or does not support push sync.`,
        color: 'orange',
      });
      return;
    }

    setSyncingToIntegration(true);
    syncToIntegrationMutation.mutate({ 
      id: workflowId, 
      projectId: projectId,
      overwriteMode: exponentialIsSourceOfTruth,
      actionIds: selectedActionIds.size > 0 ? Array.from(selectedActionIds) : undefined
    });
  };

  // Handler for pulling actions from configured integration (pull sync)
  const handlePullFromIntegration = () => {
    if (!project || !projectId) {
      notifications.show({
        title: 'Error',
        message: 'No project selected',
        color: 'red',
      });
      return;
    }

    if (!project.taskManagementTool || project.taskManagementTool === 'internal') {
      notifications.show({
        title: 'No Integration Configured',
        message: 'This project is not configured to use an external task management tool. Configure it in project settings.',
        color: 'orange',
      });
      return;
    }

    // For pull sync, we can use any active workflow for the same provider
    // The syncDirection doesn't matter since we're explicitly calling pull
    const pullWorkflow = workflows.find(w => 
      w.provider === project.taskManagementTool && 
      w.status === 'ACTIVE'
    );

    if (!pullWorkflow) {
      notifications.show({
        title: 'Workflow Not Found',
        message: `No active ${project.taskManagementTool} workflow found. Please create or enable one in the Workflows section.`,
        color: 'orange',
      });
      return;
    }

    setPullingFromIntegration(true);
    pullFromIntegrationMutation.mutate({ id: pullWorkflow.id, projectId: projectId });
  };

  // Handler for smart sync (checks project configuration and chooses appropriate sync method)
  const handleSmartSync = () => {
    if (!project || !projectId) {
      notifications.show({
        title: 'Error',
        message: 'No project selected',
        color: 'red',
      });
      return;
    }

    if (!project.taskManagementTool || project.taskManagementTool === 'internal') {
      notifications.show({
        title: 'No Integration Configured',
        message: 'This project is not configured to use an external task management tool. Configure it in project settings.',
        color: 'orange',
      });
      return;
    }

    const config = project.taskManagementConfig as {
      syncStrategy?: 'manual' | 'auto_pull_then_push' | 'notion_canonical';
    } || {};

    const syncStrategy = config.syncStrategy || 'manual';

    // For non-manual strategies, use smart sync
    if (syncStrategy === 'auto_pull_then_push' || syncStrategy === 'notion_canonical') {
      setSyncingToIntegration(true);
      setPullingFromIntegration(true); // Both operations happening
      smartSyncMutation.mutate({ 
        projectId,
        actionIds: selectedActionIds.size > 0 ? Array.from(selectedActionIds) : undefined
      });
    } else {
      // For manual strategy, use the regular push sync
      handleSyncToIntegration();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Sync Configuration Accordion */}
      {actions && actions.length > 0 && (
        <Paper withBorder radius="sm" mb="md">
          {/* Accordion Header */}
          <Group 
            justify="space-between" 
            align="center" 
            p="md" 
            style={{ cursor: 'pointer' }}
            onClick={() => setSyncConfigExpanded(!syncConfigExpanded)}
          >
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Sync Configuration
              </Text>
              {syncConfigExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </Group>
            {displayAlignment && (
              <Button
                variant="subtle"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAlignmentMode(!isAlignmentMode);
                }}
              >
                <Group gap="xs">
                  {isAlignmentMode ? <IconList size={16} /> : <IconLayoutKanban size={16} />}
                  {isAlignmentMode ? 'Task View' : 'Alignment View'}
                </Group>
              </Button>
            )}
          </Group>

          {/* Accordion Content */}
          {syncConfigExpanded && (
            <div style={{ borderTop: '1px solid var(--mantine-color-gray-7)' }}>
              <Group justify="space-between" align="center" p="md">
                <Group gap="md">
                  {/* Select All/None - on left side */}
                  <Button
                    size="xs"
                    variant="light"
                    onClick={handleSelectAll}
                    leftSection={<IconLayoutKanban size={14} />}
                  >
                    Select All
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={handleSelectNone}
                    leftSection={<IconList size={14} />}
                  >
                    Select None
                  </Button>
                  
                  {/* Selection Info */}
                  {selectedActionIds.size > 0 && (
                    <Badge variant="filled" color="blue">
                      {selectedActionIds.size} selected
                    </Badge>
                  )}
                </Group>

                <Group gap="xs">
                  {/* Sync Buttons - only show for projects with external task management */}
                  {projectId && project && project.taskManagementTool && project.taskManagementTool !== 'internal' && (() => {
                    const config = project.taskManagementConfig as {
                      syncStrategy?: 'manual' | 'auto_pull_then_push' | 'notion_canonical';
                    } || {};
                    const syncStrategy = config.syncStrategy || 'manual';
                    const integrationName = project.taskManagementTool === 'monday' ? 'Monday.com' : 
                                           project.taskManagementTool === 'notion' ? 'Notion' : 
                                           project.taskManagementTool;

                    // Show smart sync button for non-manual strategies
                    if (syncStrategy === 'auto_pull_then_push' || syncStrategy === 'notion_canonical') {
                      return (
                        <Group gap="xs">
                          <Button
                            variant="light"
                            size="sm"
                            color={project.taskManagementTool === 'monday' ? 'orange' : 
                                  project.taskManagementTool === 'notion' ? 'violet' : 'blue'}
                            loading={syncingToIntegration || pullingFromIntegration}
                            onClick={handleSmartSync}
                            leftSection={syncStrategy === 'notion_canonical' ? 
                              <IconDownload size={16} /> : <IconUpload size={16} />}
                          >
                            {syncStrategy === 'notion_canonical' ? 
                              `Sync with ${integrationName}` : 
                              `Smart Sync with ${integrationName}`}
                          </Button>
                          {onToggleSyncStatus && (
                            <ActionIcon
                              variant="light"
                              size="sm"
                              color="gray"
                              onClick={onToggleSyncStatus}
                              title="Show sync configuration"
                            >
                              <IconSettings size={16} />
                            </ActionIcon>
                          )}
                        </Group>
                      );
                    }

                    // Show manual sync buttons for manual strategy
                    return (
                      <>
                        {/* Source of truth toggle - only for Notion */}
                        {project.taskManagementTool === 'notion' && (
                          <Tooltip label={exponentialIsSourceOfTruth ? 
                            "Exponential is the source of truth. Push will overwrite Notion completely." : 
                            "Notion is the source of truth. Push will only add/update tasks."}>
                            <Switch
                              size="sm"
                              checked={exponentialIsSourceOfTruth}
                              onChange={(event) => setExponentialIsSourceOfTruth(event.currentTarget.checked)}
                              label={
                                <Text size="xs" c="dimmed">
                                  {exponentialIsSourceOfTruth ? "Exponential → Notion" : "Notion ← Exponential"}
                                </Text>
                              }
                            />
                          </Tooltip>
                        )}
                        
                        <Button
                          variant="light"
                          size="sm"
                          color={project.taskManagementTool === 'monday' ? 'orange' : 
                                project.taskManagementTool === 'notion' ? (exponentialIsSourceOfTruth ? 'red' : 'gray') : 'blue'}
                          loading={syncingToIntegration}
                          onClick={handleSyncToIntegration}
                          leftSection={<IconUpload size={16} />}
                        >
                          {project.taskManagementTool === 'notion' && exponentialIsSourceOfTruth ? 
                            `Overwrite ${integrationName}` : 
                            `Push to ${integrationName}`}
                        </Button>
                        
                        {/* Pull button - only show for providers that support it and when Notion is source of truth */}
                        {project.taskManagementTool === 'notion' && !exponentialIsSourceOfTruth && (
                          <Button
                            variant="outline"
                            size="sm"
                            color="gray"
                            loading={pullingFromIntegration}
                            onClick={handlePullFromIntegration}
                            leftSection={<IconDownload size={16} />}
                          >
                            Pull from Notion
                          </Button>
                        )}
                        
                        {onToggleSyncStatus && (
                          <ActionIcon
                            variant="light"
                            size="sm"
                            color="gray"
                            onClick={onToggleSyncStatus}
                            title="Show sync configuration"
                          >
                            <IconSettings size={16} />
                          </ActionIcon>
                        )}
                      </>
                    );
                  })()}

                  {/* Bulk Actions */}
                  {selectedActionIds.size > 0 && (
                    <Button
                      size="xs"
                      variant="filled"
                      color="red"
                      onClick={handleBulkDelete}
                      loading={bulkDeleteMutation.isPending}
                    >
                      Delete Selected
                    </Button>
                  )}
                </Group>
              </Group>
            </div>
          )}
        </Paper>
      )}

      {isAlignmentMode && (
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-[#262626] border border-blue-900/30">
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
                    <Paper p="sm" className="bg-[#1E1E1E] cursor-pointer hover:bg-[#2C2C2C] transition-colors">
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
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-[#262626] border border-indigo-900/30">
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
                    <Paper p="sm" className="bg-[#1E1E1E] cursor-pointer hover:bg-[#2C2C2C] transition-colors">
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
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-[#262626] border border-indigo-900/30">
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
        selectedActionIds={selectedActionIds}
        onSelectionChange={setSelectedActionIds}
        showCheckboxes={syncConfigExpanded}
      />
      <div className="mt-6">
        <CreateActionModal viewName={viewName} projectId={projectId}/>
      </div>
    </div>
  );
} 