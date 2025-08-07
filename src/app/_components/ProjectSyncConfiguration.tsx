"use client";

import { Button, Paper, Text, Group, Switch, Tooltip, Badge } from "@mantine/core";
import { useState } from "react";
import { IconUpload, IconDownload, IconChevronDown, IconChevronUp, IconLayoutKanban, IconList } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface ProjectSyncConfigurationProps {
  project: {
    id: string;
    taskManagementTool?: string | null;
    taskManagementConfig?: any;
  };
  actions?: any[];
  selectedActionIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

export function ProjectSyncConfiguration({ 
  project, 
  actions = [], 
  selectedActionIds, 
  onSelectionChange 
}: ProjectSyncConfigurationProps) {
  const [syncingToIntegration, setSyncingToIntegration] = useState(false);
  const [pullingFromIntegration, setPullingFromIntegration] = useState(false);
  const [exponentialIsSourceOfTruth, setExponentialIsSourceOfTruth] = useState(false);
  const [syncConfigExpanded, setSyncConfigExpanded] = useState(false);

  const { data: workflows = [] } = api.workflow.list.useQuery();

  // Bulk delete mutation
  const bulkDeleteMutation = api.action.bulkDelete.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Actions Deleted',
        message: `Successfully deleted ${data.count} actions`,
        color: 'green',
      });
      onSelectionChange(new Set());
      // Note: Parent should handle refetching actions
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
      
      const integrationName = project.taskManagementTool === 'monday' ? 'Monday.com' : 
                             project.taskManagementTool === 'notion' ? 'Notion' : 
                             project.taskManagementTool;
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
      
      const integrationName = project.taskManagementTool === 'monday' ? 'Monday.com' : 
                             project.taskManagementTool === 'notion' ? 'Notion' : 
                             project.taskManagementTool;
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
      
      const integrationName = project.taskManagementTool === 'monday' ? 'Monday.com' : 
                             project.taskManagementTool === 'notion' ? 'Notion' : 
                             project.taskManagementTool;
      
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
    onSelectionChange(new Set(allActionIds));
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedActionIds.size === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedActionIds.size} actions?`)) {
      await bulkDeleteMutation.mutateAsync({
        actionIds: Array.from(selectedActionIds),
      });
    }
  };

  // Handler for syncing actions to configured integration (push sync)
  const handleSyncToIntegration = () => {
    if (!project) {
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
      projectId: project.id,
      overwriteMode: exponentialIsSourceOfTruth,
      actionIds: selectedActionIds.size > 0 ? Array.from(selectedActionIds) : undefined
    });
  };

  // Handler for pulling actions from configured integration (pull sync)
  const handlePullFromIntegration = () => {
    if (!project) {
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
    pullFromIntegrationMutation.mutate({ id: pullWorkflow.id, projectId: project.id });
  };

  // Handler for smart sync (checks project configuration and chooses appropriate sync method)
  const handleSmartSync = () => {
    if (!project) {
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
        projectId: project.id,
        actionIds: selectedActionIds.size > 0 ? Array.from(selectedActionIds) : undefined
      });
    } else {
      // For manual strategy, use the regular push sync
      handleSyncToIntegration();
    }
  };

  // Don't show for projects without external integration
  if (!project.taskManagementTool || project.taskManagementTool === 'internal') {
    return null;
  }

  return (
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
          <Text size="sm" fw={500}>
            Task Sync Configuration
          </Text>
          {syncConfigExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </Group>
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
              {project.taskManagementTool && project.taskManagementTool !== 'internal' && (() => {
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
  );
}