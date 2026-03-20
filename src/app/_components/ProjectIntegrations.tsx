"use client";

import { useState, useEffect } from "react";
import {
  Stack,
  Title,
  Text,
  Card, 
  Group,
  ThemeIcon,
  Badge,
  Button,
  ActionIcon,
  Collapse,
  Paper,
  Alert,
  Modal,
  Select,
  TextInput,
  Loader,
} from "@mantine/core";
import {
  IconSettings,
  IconBrandNotion,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronUp,
  IconCheck,
  IconAlertCircle,
  IconPlus,
  IconExternalLink,
  IconBrandSlack,
  IconRefresh,
  IconFolder,
  IconDatabase,
  IconArrowsLeftRight,
  IconClock,
  IconTrash,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NotionSetupWizard } from "./integrations/NotionSetupWizard";

interface ProjectIntegrationsProps {
  project: {
    id: string;
    name: string;
    taskManagementTool?: string | null;
    taskManagementConfig?: any;
    notionProjectId?: string | null;
    teamId?: string | null;
  };
}

interface NewIntegrationForm {
  type: string;
  workflowId: string;
}

// Define available project integrations
const availableIntegrations = [
  {
    id: 'notion',
    title: 'Notion Tasks Sync',
    description: 'Bidirectional sync between your project tasks and Notion databases.',
    icon: IconBrandNotion,
    color: 'violet',
    setupSteps: [
      'Connect Notion workspace via OAuth',
      'Configure database sync settings', 
      'Map fields between systems',
      'Activate bidirectional sync'
    ],
    href: '/workflows/notion'
  },
  {
    id: 'monday',
    title: 'Monday.com Integration',
    description: 'Push your action items and tasks to Monday.com boards.',
    icon: IconCalendarEvent,
    color: 'orange',
    setupSteps: [
      'Connect Monday.com with API token',
      'Select target board and columns',
      'Configure field mappings',
      'Activate automatic sync'
    ],
    href: '/workflows/monday'
  }
];

export function ProjectIntegrations({ project }: ProjectIntegrationsProps) {
  const [expandedIntegrations, setExpandedIntegrations] = useState<Set<string>>(new Set());
  const [newIntegrationModalOpened, { open: openNewIntegrationModal, close: closeNewIntegrationModal }] = useDisclosure(false);
  const [configureProjectModalOpened, { open: openConfigureProjectModal, close: closeConfigureProjectModal }] = useDisclosure(false);
  const [notionWizardOpened, { open: openNotionWizard, close: closeNotionWizard }] = useDisclosure(false);
  const [notionWizardEditMode, setNotionWizardEditMode] = useState(false);
  const [selectedSlackIntegration, setSelectedSlackIntegration] = useState<string>('');
  const [selectedSlackChannel, setSelectedSlackChannel] = useState<string>('');
  const [slackConfigExpanded, setSlackConfigExpanded] = useState(false);
  const [selectedNotionProjectId, setSelectedNotionProjectId] = useState<string>(project.notionProjectId ?? '');
  const [selectedSyncStrategy, setSelectedSyncStrategy] = useState<string>(project.taskManagementConfig?.syncStrategy ?? 'manual');
  const [mondayConfigOpened, { open: openMondayConfig, close: closeMondayConfig }] = useDisclosure(false);
  const [mondayBoardId, setMondayBoardId] = useState<string>(project.taskManagementConfig?.boardId ?? '');
  const [mondaySyncDirection, setMondaySyncDirection] = useState<string>(project.taskManagementConfig?.syncDirection ?? 'pull');
  const [mondaySyncFrequency, setMondaySyncFrequency] = useState<string>(project.taskManagementConfig?.syncFrequency ?? 'manual');
  const searchParams = useSearchParams();

  // Auto-open Notion wizard after OAuth redirect
  useEffect(() => {
    const successParam = searchParams.get('success');
    if (successParam?.toLowerCase().includes('notion')) {
      setNotionWizardEditMode(false);
      openNotionWizard();
    }
  }, [searchParams, openNotionWizard]);

  // Get available workflows for this project
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const { data: allAccessibleIntegrations = [] } = api.integrationPermission.getAccessibleIntegrations.useQuery({});
  const { data: slackIntegrations = [], isLoading: isLoadingSlackIntegrations } = api.integrationPermission.getAccessibleIntegrations.useQuery({
    provider: 'slack'
  });
  const utils = api.useUtils();
  const { data: slackChannelConfig } = api.slack.getChannelConfig.useQuery(
    { projectId: project.id },
    { enabled: !!project.id }
  );
  // Get available channels for selected integration (only if user owns the integration)
  const selectedIntegrationData = slackIntegrations?.find(i => i.id === selectedSlackIntegration);
  const canFetchChannels = selectedIntegrationData?.accessType === 'owned';
  
  const { data: availableChannels = [] } = api.slack.getAvailableChannelsForIntegration.useQuery(
    { integrationId: selectedSlackIntegration },
    { enabled: !!selectedSlackIntegration && canFetchChannels }
  );

  // Update task management mutation
  const updateTaskManagement = api.project.updateTaskManagement.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Integration Updated',
        message: 'Project integration has been configured successfully.',
        color: 'green',
      });
      void utils.project.getById.invalidate({ id: project.id });
      closeNewIntegrationModal();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to configure integration',
        color: 'red',
      });
    },
  });

  // Slack configuration mutations
  const configureSlackChannelMutation = api.slack.configureChannel.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Slack Channel Configured',
        message: 'Slack notifications for this project have been configured successfully.',
        color: 'green',
      });
      void utils.slack.getChannelConfig.invalidate({ projectId: project.id });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to configure Slack channel.',
        color: 'red',
      });
    },
  });

  const removeSlackConfigMutation = api.slack.removeChannelConfig.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Slack Configuration Removed',
        message: 'Slack notifications for this project have been disabled.',
        color: 'green',
      });
      setSelectedSlackIntegration('');
      setSelectedSlackChannel('');
      void utils.slack.getChannelConfig.invalidate({ projectId: project.id });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to remove Slack configuration.',
        color: 'red',
      });
    },
  });

  // Sync workflow mutation
  const runWorkflow = api.workflow.run.useMutation({
    onSuccess: (data: any) => {
      const debugInfo = data.debug ? ` | Route: ${data.debug.route} | Board: ${data.debug.boardId ?? 'n/a'} | Items fetched: ${data.debug.boardItemCount ?? 'n/a'}` : '';
      notifications.show({
        title: 'Sync Complete',
        message: `Synced ${data.itemsCreated} new, updated ${data.itemsUpdated}, skipped ${data.itemsSkipped ?? 0}. Processed ${data.itemsProcessed ?? '?'} items.${debugInfo}`,
        color: data.itemsCreated > 0 || data.itemsUpdated > 0 ? 'green' : 'yellow',
        autoClose: 10000,
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Sync Failed',
        message: error.message || 'Failed to sync',
        color: 'red',
        autoClose: 10000,
      });
    },
  });

  // Get the configured workflow for this project
  const configuredWorkflowId = project.taskManagementConfig?.workflowId;

  // Fetch Notion projects from the configured workflow's projects database
  const { data: notionProjectsData, isLoading: isLoadingNotionProjects } = api.workflow.getNotionProjects.useQuery(
    { workflowId: configuredWorkflowId ?? '' },
    { enabled: !!configuredWorkflowId && project.taskManagementTool === 'notion' }
  );

  // Form for adding new integration
  const newIntegrationForm = useForm<NewIntegrationForm>({
    initialValues: {
      type: '',
      workflowId: '',
    },
    validate: {
      type: (value) => !value ? 'Please select an integration type' : null,
      workflowId: (value) => !value ? 'Please select a workflow' : null,
    },
  });

  const toggleIntegrationExpanded = (integrationId: string) => {
    setExpandedIntegrations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(integrationId)) {
        newSet.delete(integrationId);
      } else {
        newSet.add(integrationId);
      }
      return newSet;
    });
  };

  // Effect to populate Slack form when config loads
  useEffect(() => {
    if (slackChannelConfig) {
      setSelectedSlackIntegration(slackChannelConfig.integration.id);
      setSelectedSlackChannel(slackChannelConfig.slackChannel);
    }
  }, [slackChannelConfig]);

  // Slack configuration handlers
  const handleConfigureSlackChannel = () => {
    if (!selectedSlackIntegration || !selectedSlackChannel || (selectedSlackChannel === 'custom' && canFetchChannels)) {
      notifications.show({
        title: 'Error',
        message: 'Please select a Slack integration and provide a valid channel name.',
        color: 'red',
      });
      return;
    }

    // Ensure channel starts with #
    const channelName = selectedSlackChannel.startsWith('#') 
      ? selectedSlackChannel 
      : `#${selectedSlackChannel}`;

    // Look up the Slack channel ID from the available channels list
    const channelId = availableChannels.find(c => c.name === selectedSlackChannel)?.id;

    configureSlackChannelMutation.mutate({
      integrationId: selectedSlackIntegration,
      channel: channelName,
      channelId,
      projectId: project.id,
    });
  };

  const handleRemoveSlackConfig = () => {
    if (slackChannelConfig) {
      removeSlackConfigMutation.mutate({ configId: slackChannelConfig.id });
    }
  };

  // Notion sync handler
  const handleSync = () => {
    const workflowId = project.taskManagementConfig?.workflowId;
    if (!workflowId) {
      notifications.show({
        title: 'Error',
        message: 'No workflow configured for this project',
        color: 'red',
      });
      return;
    }
    runWorkflow.mutate({ id: workflowId, projectId: project.id });
  };

  // Save Notion project selection handler
  const handleSaveNotionProject = async () => {
    if (!selectedNotionProjectId) {
      notifications.show({
        title: 'Error',
        message: 'Please select a Notion project',
        color: 'red',
      });
      return;
    }

    await updateTaskManagement.mutateAsync({
      id: project.id,
      taskManagementTool: 'notion',
      taskManagementConfig: {
        ...project.taskManagementConfig,
        syncStrategy: selectedSyncStrategy,
      },
      notionProjectId: selectedNotionProjectId,
    });
    closeConfigureProjectModal();
  };

  // Update workflow mutation (for syncing workflow record with config changes)
  const updateWorkflow = api.workflow.update.useMutation({
    onError: (error) => {
      console.error('Failed to update workflow:', error);
    },
  });

  // Delete workflow mutation
  const deleteWorkflow = api.workflow.delete.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Workflow Deleted',
        message: 'Workflow has been removed.',
        color: 'green',
      });
      void utils.workflow.list.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete workflow',
        color: 'red',
      });
    },
  });

  // Remove integration from project
  const handleRemoveIntegration = async () => {
    await updateTaskManagement.mutateAsync({
      id: project.id,
      taskManagementTool: 'internal',
      taskManagementConfig: {},
    });
  };

  // Save Monday.com configuration handler
  const handleSaveMondayConfig = async () => {
    if (!mondayBoardId.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter a board ID',
        color: 'red',
      });
      return;
    }

    const workflowId = project.taskManagementConfig?.workflowId;

    if (!workflowId) {
      notifications.show({
        title: 'Error',
        message: 'No workflow linked to this project. Please remove and re-add the Monday.com integration via "Add to Project".',
        color: 'red',
      });
      return;
    }

    // Update the project's taskManagementConfig
    await updateTaskManagement.mutateAsync({
      id: project.id,
      taskManagementTool: 'monday',
      taskManagementConfig: {
        ...project.taskManagementConfig,
        boardId: mondayBoardId.trim(),
        syncDirection: mondaySyncDirection,
        syncFrequency: mondaySyncFrequency,
      },
    });

    // Also update the actual workflow record so workflow.run reads the correct config
    await updateWorkflow.mutateAsync({
      id: workflowId,
      syncDirection: mondaySyncDirection as 'push' | 'pull' | 'bidirectional',
      syncFrequency: mondaySyncFrequency as 'manual' | 'hourly' | 'daily' | 'weekly',
      config: {
        boardId: mondayBoardId.trim(),
      },
    });

    closeMondayConfig();
  };

  // Get configured integrations for this project
  const getConfiguredIntegrations = () => {
    const configured = [];
    
    if (project.taskManagementTool && project.taskManagementTool !== 'internal') {
      const integration = availableIntegrations.find(i => i.id === project.taskManagementTool);
      if (integration) {
        configured.push({
          ...integration,
          status: 'Active',
          isConfigured: true,
          config: project.taskManagementConfig
        });
      }
    }
    
    return configured;
  };

  // Get available integrations (not yet configured)
  // Since only one task sync integration is allowed, filter out the other if one is already configured
  const getAvailableIntegrations = () => {
    const hasTaskSyncIntegration = project.taskManagementTool && project.taskManagementTool !== 'internal';
    
    if (hasTaskSyncIntegration) {
      // If already has a task sync integration, don't show any other task sync options
      return [];
    }
    
    // If no task sync integration, show all available options
    return availableIntegrations;
  };

  const handleNewIntegration = async (values: NewIntegrationForm) => {
    const workflow = workflows.find(w => w.id === values.workflowId);
    if (!workflow) return;

    // Configure the integration based on type
    if (values.type === 'notion') {
      await updateTaskManagement.mutateAsync({
        id: project.id,
        taskManagementTool: 'notion',
        taskManagementConfig: {
          workflowId: values.workflowId,
          databaseId: (workflow.config && typeof workflow.config === 'object' && 'databaseId' in workflow.config && typeof workflow.config.databaseId === 'string') ? workflow.config.databaseId : '',
          syncStrategy: 'manual',
          conflictResolution: 'local_wins',
          deletionBehavior: 'mark_deleted',
        },
      });
    } else if (values.type === 'monday') {
      const boardId = (workflow.config && typeof workflow.config === 'object' && 'boardId' in workflow.config && typeof workflow.config.boardId === 'string') ? workflow.config.boardId : '';
      await updateTaskManagement.mutateAsync({
        id: project.id,
        taskManagementTool: 'monday',
        taskManagementConfig: {
          workflowId: values.workflowId,
          boardId,
          syncDirection: 'pull',
          syncFrequency: 'manual',
        },
      });
    }
  };

  const configuredIntegrations = getConfiguredIntegrations();
  const availableForSetup = getAvailableIntegrations();

  return (
    <>
      <Stack gap="md">
        <Group gap="sm">
          <ThemeIcon size="md" variant="light" color="teal">
            <IconSettings size={18} />
          </ThemeIcon>
          <Title order={4}>Project Integrations</Title>
        </Group>

        <Text size="sm" c="dimmed">
          Connect external tools and services to sync data with this project.
        </Text>

        {/* Configured Integrations */}
        {configuredIntegrations.length > 0 && (
          <Stack gap="sm">
            <Text size="sm" fw={500} c="dimmed">Task Sync Integration</Text>
            {configuredIntegrations.map((integration) => {
              const isExpanded = expandedIntegrations.has(integration.id);
              
              return (
                <Card key={integration.id} shadow="sm" padding="md" radius="md" withBorder>
                  <Stack gap="md">
                    {/* Header Row - Icon, Title, Badge */}
                    <Group justify="space-between" align="flex-start">
                      <Group align="center" gap="md">
                        <ThemeIcon size="lg" variant="light" color={integration.color} radius="md">
                          <integration.icon size={24} />
                        </ThemeIcon>
                        <div>
                          <Group gap="xs" align="center">
                            <Text fw={600} size="md">
                              {integration.title}
                            </Text>
                            <Badge color="green" variant="light" size="sm">
                              Active
                            </Badge>
                          </Group>
                          <Text size="sm" c="dimmed" mt={2}>
                            {integration.description}
                          </Text>
                        </div>
                      </Group>
                      <ActionIcon
                        variant="subtle"
                        onClick={() => toggleIntegrationExpanded(integration.id)}
                        aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      >
                        {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                      </ActionIcon>
                    </Group>

                    {/* Configuration Summary */}
                    {integration.config && (
                      <Paper p="sm" radius="sm" className="bg-surface-secondary">
                        <Group gap="lg" wrap="wrap">
                          {(integration.config.databaseName ?? integration.config.databaseId) && (
                            <Group gap="xs">
                              <IconDatabase size={14} className="text-text-muted" />
                              <Text size="sm">
                                {integration.config.databaseName ?? integration.config.databaseId}
                              </Text>
                            </Group>
                          )}
                          {integration.config.syncDirection && (
                            <Group gap="xs">
                              <IconArrowsLeftRight size={14} className="text-text-muted" />
                              <Text size="sm">
                                {integration.config.syncDirection === 'pull'
                                  ? `Pull from ${integration.id === 'notion' ? 'Notion' : 'Monday.com'}`
                                  : integration.config.syncDirection === 'push'
                                    ? `Push to ${integration.id === 'notion' ? 'Notion' : 'Monday.com'}`
                                    : 'Bidirectional'}
                              </Text>
                            </Group>
                          )}
                          {integration.config.syncFrequency && (
                            <Group gap="xs">
                              <IconClock size={14} className="text-text-muted" />
                              <Text size="sm" tt="capitalize">
                                {integration.config.syncFrequency}
                              </Text>
                            </Group>
                          )}
                          {integration.id === 'notion' && integration.config.notionWorkspaceName && (
                            <Group gap="xs">
                              <IconBrandNotion size={14} className="text-text-muted" />
                              <Text size="sm">
                                {integration.config.notionWorkspaceName}
                              </Text>
                            </Group>
                          )}
                        </Group>
                      </Paper>
                    )}

                    {/* Action Buttons Row */}
                    <Group gap="xs">
                      <Button
                        size="sm"
                        variant="filled"
                        leftSection={<IconRefresh size={14} />}
                        onClick={handleSync}
                        loading={runWorkflow.isPending}
                      >
                        Sync
                      </Button>
                      {integration.id === 'monday' && (
                        <Button
                          size="sm"
                          variant="light"
                          leftSection={<IconSettings size={14} />}
                          onClick={() => {
                            setMondayBoardId(integration.config?.boardId ?? '');
                            setMondaySyncDirection(integration.config?.syncDirection ?? 'push');
                            setMondaySyncFrequency(integration.config?.syncFrequency ?? 'manual');
                            openMondayConfig();
                          }}
                        >
                          Configure
                        </Button>
                      )}
                      {integration.id === 'notion' && (
                        <>
                          <Button
                            size="sm"
                            variant="light"
                            leftSection={<IconSettings size={14} />}
                            onClick={() => {
                              setNotionWizardEditMode(true);
                              openNotionWizard();
                            }}
                          >
                            Configure Notion
                          </Button>
                          <Button
                            size="sm"
                            variant="light"
                            leftSection={<IconFolder size={14} />}
                            onClick={openConfigureProjectModal}
                          >
                            Configure Project
                          </Button>
                        </>
                      )}
                    </Group>

                    {/* Expandable Details */}
                    <Collapse in={isExpanded}>
                      <Stack gap="md" pt="sm">
                        <Alert
                          icon={<IconCheck size={16} />}
                          title="Integration Active"
                          color="green"
                          variant="light"
                        >
                          This integration is configured and ready to sync data.
                        </Alert>

                        {/* Advanced Configuration Details */}
                        {integration.config && (
                          <Paper p="sm" radius="sm" className="bg-surface-secondary">
                            <Text size="sm" fw={500} mb="xs">Advanced Details:</Text>
                            <Stack gap="xs">
                              {integration.config.workflowId && (
                                <Text size="xs" c="dimmed">
                                  Workflow: {workflows.find(w => w.id === integration.config.workflowId)?.name ?? 'Unknown'}
                                </Text>
                              )}
                              {integration.config.databaseId && (
                                <Text size="xs" c="dimmed">
                                  Database ID: {integration.config.databaseId}
                                </Text>
                              )}
                              {integration.config.boardId && (
                                <Text size="xs" c="dimmed">
                                  Board ID: {integration.config.boardId}
                                </Text>
                              )}
                              {integration.config.syncStrategy && (
                                <Text size="xs" c="dimmed">
                                  Sync Strategy: {integration.config.syncStrategy}
                                </Text>
                              )}
                            </Stack>
                          </Paper>
                        )}
                      </Stack>
                    </Collapse>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}

        {/* Available Integrations */}
        {availableForSetup.length > 0 ? (
          <Stack gap="sm">
            <Text size="sm" fw={500} c="dimmed">Available Task Sync Integrations</Text>
            {availableForSetup.map((integration) => {
              const isExpanded = expandedIntegrations.has(integration.id);
              const hasActiveIntegration = allAccessibleIntegrations.some(int => 
                int.provider === integration.id && int.status === 'ACTIVE'
              );
              const hasWorkflows = workflows.some(w => w.provider === integration.id);
              
              return (
                <Card key={integration.id} shadow="sm" padding="md" radius="md" withBorder>
                  <Stack gap="md">
                    {/* Main Row */}
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Group align="center" gap="md" style={{ flex: 1 }}>
                        <ThemeIcon size="lg" variant="light" color={integration.color} radius="md">
                          <integration.icon size={24} />
                        </ThemeIcon>
                        <div style={{ flex: 1 }}>
                          <Group gap="xs" align="center">
                            <Text fw={600} size="md">
                              {integration.title}
                            </Text>
                            <Badge color="blue" variant="light" size="sm">
                              Available
                            </Badge>
                          </Group>
                          <Text size="sm" c="dimmed" mt={2}>
                            {integration.description}
                          </Text>
                        </div>
                      </Group>
                      
                      {/* Action Buttons */}
                      <Group gap="xs">
                        {hasActiveIntegration && hasWorkflows ? (
                          <Button
                            size="sm"
                            variant="filled"
                            onClick={() => {
                              newIntegrationForm.setFieldValue('type', integration.id);
                              openNewIntegrationModal();
                            }}
                            leftSection={<IconPlus size={14} />}
                          >
                            Add to Project
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="light"
                            leftSection={<IconExternalLink size={14} />}
                            onClick={() => {
                              if (integration.id === 'notion') {
                                setNotionWizardEditMode(false);
                                openNotionWizard();
                              } else {
                                window.location.href = integration.href;
                              }
                            }}
                          >
                            Setup Integration
                          </Button>
                        )}
                        
                        <ActionIcon
                          variant="subtle"
                          onClick={() => toggleIntegrationExpanded(integration.id)}
                          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                        >
                          {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                        </ActionIcon>
                      </Group>
                    </Group>

                    {/* Expandable Details */}
                    <Collapse in={isExpanded}>
                      <Stack gap="md" pt="sm">
                        {!hasActiveIntegration ? (
                          <Alert
                            icon={<IconAlertCircle size={16} />}
                            title="Setup Required"
                            color="orange"
                            variant="light"
                          >
                            {`Connect your ${integration.title.replace(' Sync', '').replace(' Integration', '')} account first, then configure sync for this project.`}
                          </Alert>
                        ) : !hasWorkflows ? (
                          <Alert
                            icon={<IconCheck size={16} />}
                            title="Account Connected"
                            color="blue"
                            variant="light"
                          >
                            {`Your ${integration.title.replace(' Sync', '').replace(' Integration', '')} account is connected. Click "Setup Integration" to select a database and configure sync.`}
                          </Alert>
                        ) : (
                          <Alert
                            icon={<IconCheck size={16} />}
                            title="Ready to Add"
                            color="blue"
                            variant="light"
                          >
                            Integration is configured and ready to be added to this project.
                          </Alert>
                        )}

                        {/* Setup Steps */}
                        <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                          <Text size="sm" fw={500} mb="xs">Setup Steps:</Text>
                          <Stack gap="xs">
                            {integration.setupSteps.map((step, index) => (
                              <Group key={index} gap="xs" align="center">
                                <ThemeIcon size="xs" variant="filled" color={integration.color} radius="xl">
                                  <Text size="xs">{index + 1}</Text>
                                </ThemeIcon>
                                <Text size="xs" c="dimmed">{step}</Text>
                              </Group>
                            ))}
                          </Stack>
                        </Paper>
                      </Stack>
                    </Collapse>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        ) : configuredIntegrations.length > 0 ? (
          <Stack gap="sm">
            <Text size="sm" fw={500} c="dimmed">Other Task Sync Options</Text>
            <Alert 
              icon={<IconAlertCircle size={16} />}
              title="Only One Task Sync Integration Allowed"
              color="blue"
              variant="light"
            >
              <Text size="sm">
                This project already has a task sync integration configured. 
                Remove it below to switch to a different one.
              </Text>
            </Alert>
          </Stack>
        ) : null}

        {/* Linked Workflows List */}
        {workflows.filter(w => w.project?.id === project.id).length > 0 && (
          <Stack gap="sm">
            <Text size="sm" fw={500} c="dimmed">Linked Workflows</Text>
            {workflows.filter(w => w.project?.id === project.id).map((w) => (
              <Card key={w.id} shadow="sm" padding="sm" radius="md" withBorder>
                <Group justify="space-between" align="center">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>{w.name}</Text>
                      <Badge size="xs" variant="light" color={w.integration?.status === 'ACTIVE' ? 'green' : 'red'}>
                        {w.integration?.status ?? 'Unknown'}
                      </Badge>
                    </Group>
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">Provider: {w.integration?.provider ?? w.provider}</Text>
                      <Text size="xs" c="dimmed">·</Text>
                      <Text size="xs" c="dimmed">Direction: {(w as any).syncDirection ?? 'push'}</Text>
                    </Group>
                    {w.runs?.[0] && (
                      <Text size="xs" c="dimmed">
                        Last run: {w.runs[0].status} — {w.runs[0].itemsCreated ?? 0} created, {w.runs[0].itemsUpdated ?? 0} updated
                        {w.runs[0].errorMessage && ` — Error: ${w.runs[0].errorMessage}`}
                      </Text>
                    )}
                  </Stack>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      if (confirm('Delete this workflow? This cannot be undone.')) {
                        deleteWorkflow.mutate({ id: w.id });
                      }
                    }}
                    loading={deleteWorkflow.isPending}
                    aria-label="Delete workflow"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Card>
            ))}
          </Stack>
        )}

        {/* Remove Integration Button */}
        {configuredIntegrations.length > 0 && (
          <Button
            variant="subtle"
            color="red"
            size="sm"
            leftSection={<IconTrash size={14} />}
            onClick={() => {
              if (confirm('Remove the task sync integration from this project? Workflows will not be deleted.')) {
                void handleRemoveIntegration();
              }
            }}
            loading={updateTaskManagement.isPending}
          >
            Remove Task Sync Integration
          </Button>
        )}

        {/* Slack Notifications Section */}
        {slackIntegrations.length > 0 && (
          <Stack gap="sm">
            <Text size="sm" fw={500} c="dimmed">Slack Notifications</Text>
            <Card shadow="sm" padding="md" radius="md" withBorder>
              <Stack gap="md">
                {/* Main Row */}
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Group align="center" gap="md" style={{ flex: 1 }}>
                    <ThemeIcon size="lg" variant="light" color="blue" radius="md">
                      <IconBrandSlack size={24} />
                    </ThemeIcon>
                    <div style={{ flex: 1 }}>
                      <Group gap="xs" align="center">
                        <Text fw={600} size="md">
                          Slack Channel Notifications
                        </Text>
                        {slackChannelConfig && (
                          <Badge color="green" variant="light" size="sm">
                            <Group gap={4}>
                              <IconCheck size={12} />
                              Configured
                            </Group>
                          </Badge>
                        )}
                      </Group>
                      <Text size="sm" c="dimmed" mt={2}>
                        Send meeting summaries and action items to a Slack channel when transcriptions are processed.
                      </Text>
                    </div>
                  </Group>
                  
                  {/* Action Button */}
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setSlackConfigExpanded(!slackConfigExpanded)}
                    aria-label={slackConfigExpanded ? 'Collapse Slack settings' : 'Expand Slack settings'}
                  >
                    {slackConfigExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                  </ActionIcon>
                </Group>

                {/* Expandable Configuration */}
                <Collapse in={slackConfigExpanded}>
                  <Stack gap="md" pt="sm">
                    {/* Current Configuration Display */}
                    {slackChannelConfig && (
                      <Alert 
                        icon={<IconCheck size={16} />}
                        title="Configuration Active"
                        color="green"
                        variant="light"
                      >
                        <Text size="sm">
                          Meeting summaries will be sent to <strong>{slackChannelConfig.slackChannel}</strong> in the <strong>{slackChannelConfig.integration.name}</strong> workspace.
                        </Text>
                        {project.teamId && (
                          <Text size="xs" c="dimmed" mt="xs">
                            This overrides the team&apos;s default Slack channel (if configured).
                          </Text>
                        )}
                      </Alert>
                    )}

                    {/* Configuration Form */}
                    <Paper p="md" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                      <Stack gap="md">
                        <Text size="sm" fw={500}>
                          {slackChannelConfig ? 'Update Configuration' : 'Configure Slack Channel'}
                        </Text>
                        
                        <Select
                          label="Slack Workspace"
                          placeholder="Select a Slack integration"
                          value={selectedSlackIntegration}
                          onChange={(value) => setSelectedSlackIntegration(value || '')}
                          data={slackIntegrations.map(integration => ({
                            value: integration.id,
                            label: `${integration.name} (${integration.accessType})`
                          }))}
                          required
                        />

                        {selectedSlackIntegration && (
                          <Stack gap="xs">
                            {canFetchChannels ? (
                              <Select
                                label="Slack Channel"
                                placeholder="Select a channel or type custom"
                                value={selectedSlackChannel}
                                onChange={(value) => setSelectedSlackChannel(value || '')}
                                data={[
                                  ...availableChannels.map(channel => ({
                                    value: channel.name,
                                    label: `${channel.name} (${channel.type})`
                                  })),
                                  { value: 'custom', label: '🔧 Enter custom channel name' }
                                ]}
                                searchable
                                required
                              />
                            ) : (
                              <TextInput
                                label="Channel Name"
                                placeholder="#general"
                                value={selectedSlackChannel}
                                onChange={(e) => setSelectedSlackChannel(e.target.value)}
                                description={
                                  selectedIntegrationData?.accessType === 'shared' || selectedIntegrationData?.accessType === 'team'
                                    ? `Enter the channel name for ${selectedIntegrationData.name}. You have ${selectedIntegrationData.accessType} access to this integration.`
                                    : "Enter the Slack channel name (e.g., #general)"
                                }
                                required
                              />
                            )}
                            
                            {selectedSlackChannel === 'custom' && canFetchChannels && (
                              <TextInput
                                label="Custom Channel Name"
                                placeholder="#my-custom-channel"
                                value={selectedSlackChannel !== 'custom' ? selectedSlackChannel : ''}
                                onChange={(e) => setSelectedSlackChannel(e.target.value)}
                                description="Enter the full channel name including # (e.g., #my-private-channel)"
                              />
                            )}

                            {selectedIntegrationData && selectedIntegrationData.accessType !== 'owned' && (
                              <Alert 
                                icon={<IconAlertCircle size={16} />}
                                color="blue"
                                variant="light"
                              >
                                <Text size="sm">
                                  You have <strong>{selectedIntegrationData.accessType}</strong> access to this integration.
                                  {selectedIntegrationData.grantedBy && (
                                    <> Shared by <strong>{selectedIntegrationData.grantedBy.name || selectedIntegrationData.grantedBy.email}</strong>.</>
                                  )}
                                </Text>
                              </Alert>
                            )}
                            
                            {canFetchChannels && (
                              <Text size="xs" c="dimmed">
                                💡 <strong>Can&apos;t see your channel?</strong> Make sure the bot is added to private channels by typing <code>/invite @YourBotName</code> in the channel.
                              </Text>
                            )}
                          </Stack>
                        )}

                        <Group>
                          <Button
                            size="sm"
                            onClick={handleConfigureSlackChannel}
                            loading={configureSlackChannelMutation.isPending}
                            disabled={
                              !selectedSlackIntegration || 
                              !selectedSlackChannel || 
                              (selectedSlackChannel === 'custom' && canFetchChannels)
                            }
                          >
                            {slackChannelConfig ? 'Update Channel' : 'Configure Channel'}
                          </Button>
                          
                          {slackChannelConfig && (
                            <Button
                              size="sm"
                              variant="outline"
                              color="red"
                              onClick={handleRemoveSlackConfig}
                              loading={removeSlackConfigMutation.isPending}
                            >
                              Remove Configuration
                            </Button>
                          )}
                        </Group>
                      </Stack>
                    </Paper>
                  </Stack>
                </Collapse>
              </Stack>
            </Card>
          </Stack>
        )}

        {isLoadingSlackIntegrations ? (
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <Group>
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading Slack integrations...</Text>
            </Group>
          </Card>
        ) : slackIntegrations.length === 0 ? (
          <Alert 
            icon={<IconAlertCircle size={16} />}
            title="Slack Integration Required"
            color="blue"
            variant="light"
          >
            <Text size="sm">
              To configure Slack notifications for this project, you need to set up a Slack integration first.
            </Text>
            <Button
              component={Link}
              href="/integrations"
              size="sm"
              variant="light"
              mt="sm"
              leftSection={<IconExternalLink size={14} />}
            >
              Set up Slack Integration
            </Button>
          </Alert>
        ) : null}

        {/* New Integration Button - only show if no task sync integration is configured */}
        {!configuredIntegrations.length && (
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={openNewIntegrationModal}
            disabled={availableForSetup.length === 0}
          >
            New Integration
          </Button>
        )}
      </Stack>

      {/* New Integration Modal */}
      <Modal
        opened={newIntegrationModalOpened}
        onClose={closeNewIntegrationModal}
        title="Add Integration to Project"
        size="md"
      >
        <form onSubmit={newIntegrationForm.onSubmit(handleNewIntegration)}>
          <Stack gap="md">
            <Select
              label="Integration Type"
              placeholder="Select an integration type"
              data={availableForSetup.map(integration => ({
                value: integration.id,
                label: integration.title,
              }))}
              {...newIntegrationForm.getInputProps('type')}
              required
            />

            {newIntegrationForm.values.type && (
              <Select
                label="Workflow"
                placeholder="Select a workflow"
                description={`Choose which ${newIntegrationForm.values.type} workflow this project should use`}
                data={workflows
                  .filter(w => w.provider === newIntegrationForm.values.type)
                  .map(w => ({
                    value: w.id,
                    label: w.name,
                  }))}
                {...newIntegrationForm.getInputProps('workflowId')}
                required
              />
            )}

            <Group justify="flex-end">
              <Button variant="light" onClick={closeNewIntegrationModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={updateTaskManagement.isPending}
                disabled={!newIntegrationForm.values.type || !newIntegrationForm.values.workflowId}
              >
                Add Integration
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Notion Setup Wizard */}
      <NotionSetupWizard
        opened={notionWizardOpened}
        onClose={closeNotionWizard}
        project={project}
        editMode={notionWizardEditMode}
      />

      {/* Monday.com Configuration Modal */}
      <Modal
        opened={mondayConfigOpened}
        onClose={closeMondayConfig}
        title="Configure Monday.com Integration"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Board ID"
            description="The Monday.com board ID to sync tasks with"
            placeholder="e.g. 9693278102"
            value={mondayBoardId}
            onChange={(e) => setMondayBoardId(e.currentTarget.value)}
            required
          />

          <Select
            label="Sync Direction"
            description="Which direction should tasks sync?"
            data={[
              { value: 'pull', label: 'Pull — Monday.com is source of truth' },
              { value: 'push', label: 'Push — Send tasks to Monday.com' },
              { value: 'bidirectional', label: 'Bidirectional — Sync both ways (coming soon)', disabled: true },
            ]}
            value={mondaySyncDirection}
            onChange={(value) => setMondaySyncDirection(value ?? 'push')}
          />

          <Select
            label="Sync Frequency"
            description="How often should tasks sync automatically?"
            data={[
              { value: 'manual', label: 'Manual — Only when you click Sync' },
              { value: 'hourly', label: 'Hourly' },
              { value: 'daily', label: 'Daily' },
            ]}
            value={mondaySyncFrequency}
            onChange={(value) => setMondaySyncFrequency(value ?? 'manual')}
          />

          <Group justify="flex-end">
            <Button variant="light" onClick={closeMondayConfig}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveMondayConfig}
              loading={updateTaskManagement.isPending}
              leftSection={<IconCheck size={16} />}
            >
              Save Configuration
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Configure Project Modal */}
      <Modal
        opened={configureProjectModalOpened}
        onClose={closeConfigureProjectModal}
        title="Configure Notion Project"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Select which Notion project this local project should sync with. Only tasks associated with the selected project will be synced.
          </Text>

          {isLoadingNotionProjects ? (
            <Group>
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading Notion projects...</Text>
            </Group>
          ) : notionProjectsData && notionProjectsData.length > 0 ? (
            <Select
              label="Notion Project"
              placeholder="Select a Notion project"
              description="Tasks will be filtered to only show those linked to this project"
              data={notionProjectsData.map(p => ({
                value: p.id,
                label: p.title,
              }))}
              value={selectedNotionProjectId}
              onChange={(value) => setSelectedNotionProjectId(value ?? '')}
              searchable
              clearable
            />
          ) : (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="No Projects Found"
              color="orange"
              variant="light"
            >
              No projects were found in the configured Notion Projects database. Make sure you have projects in your Notion database and the workflow is configured correctly.
            </Alert>
          )}

          <Select
            label="Sync Strategy"
            description="How should syncing between your app and Notion work?"
            data={[
              { value: 'manual', label: 'Manual - Push only when clicking sync' },
              { value: 'auto_pull_then_push', label: 'Smart Sync - Pull from Notion first, then push' },
              { value: 'notion_canonical', label: 'Notion Canonical - Notion is the source of truth (recommended for pulling tasks)' },
            ]}
            value={selectedSyncStrategy}
            onChange={(value) => setSelectedSyncStrategy(value ?? 'manual')}
          />

          {selectedSyncStrategy === 'manual' && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="orange"
              variant="light"
            >
              <Text size="sm">
                <strong>Manual mode only pushes</strong> - it won&apos;t pull tasks from Notion.
                To import tasks from Notion, select &quot;Notion Canonical&quot; or &quot;Smart Sync&quot;.
              </Text>
            </Alert>
          )}

          {project.notionProjectId && (
            <Alert
              icon={<IconCheck size={16} />}
              title="Current Configuration"
              color="blue"
              variant="light"
            >
              Currently linked to Notion project ID: {project.notionProjectId.slice(-8)}...
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="light" onClick={closeConfigureProjectModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveNotionProject}
              loading={updateTaskManagement.isPending}
              disabled={!selectedNotionProjectId}
              leftSection={<IconCheck size={16} />}
            >
              Save Configuration
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}