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
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import Link from "next/link";

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
  const [selectedSlackIntegration, setSelectedSlackIntegration] = useState<string>('');
  const [selectedSlackChannel, setSelectedSlackChannel] = useState<string>('');
  const [slackConfigExpanded, setSlackConfigExpanded] = useState(false);
  const [selectedNotionProjectId, setSelectedNotionProjectId] = useState<string>(project.notionProjectId ?? '');

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
    onSuccess: (data) => {
      notifications.show({
        title: 'Sync Complete',
        message: `Successfully synced ${data.itemsCreated} new tasks and updated ${data.itemsUpdated} existing tasks.`,
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Sync Failed',
        message: error.message || 'Failed to sync with Notion',
        color: 'red',
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

    configureSlackChannelMutation.mutate({
      integrationId: selectedSlackIntegration,
      channel: channelName,
      projectId: project.id,
    });
  };

  const handleRemoveSlackConfig = () => {
    if (slackChannelConfig) {
      removeSlackConfigMutation.mutate({ configId: slackChannelConfig.id });
    }
  };

  // Notion sync handler
  const handleSyncNotion = () => {
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
      taskManagementConfig: project.taskManagementConfig,
      notionProjectId: selectedNotionProjectId,
    });
    closeConfigureProjectModal();
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
      await updateTaskManagement.mutateAsync({
        id: project.id,
        taskManagementTool: 'monday',
        taskManagementConfig: {
          workflowId: values.workflowId,
          boardId: (workflow.config && typeof workflow.config === 'object' && 'boardId' in workflow.config && typeof workflow.config.boardId === 'string') ? workflow.config.boardId : '',
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

                    {/* Action Buttons Row */}
                    <Group gap="xs">
                      <Button
                        size="sm"
                        variant="filled"
                        leftSection={<IconRefresh size={14} />}
                        onClick={handleSyncNotion}
                        loading={runWorkflow.isPending}
                      >
                        Sync
                      </Button>
                      <Button
                        component={Link}
                        href={integration.href}
                        size="sm"
                        variant="light"
                        leftSection={<IconSettings size={14} />}
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

                        {/* Configuration Details */}
                        {integration.config && (
                          <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                            <Text size="sm" fw={500} mb="xs">Current Configuration:</Text>
                            <Stack gap="xs">
                              {integration.config.workflowId && (
                                <Text size="xs" c="dimmed">
                                  Workflow: {workflows.find(w => w.id === integration.config.workflowId)?.name || 'Unknown'}
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
                            component={Link}
                            href={integration.href}
                            size="sm"
                            variant="light"
                            leftSection={<IconExternalLink size={14} />}
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
                        {!hasActiveIntegration || !hasWorkflows ? (
                          <Alert 
                            icon={<IconAlertCircle size={16} />}
                            title="Setup Required"
                            color="orange"
                            variant="light"
                          >
                            {!hasActiveIntegration 
                              ? `Create a ${integration.title} integration first, then add it to this project.`
                              : `No workflows found for ${integration.title}. Create a workflow first.`
                            }
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
                This project already has a task sync integration configured. To avoid conflicts, 
                only one task management sync (Notion OR Monday.com) is supported per project.
              </Text>
              <Text size="sm" mt="xs">
                To switch to a different task sync integration, you&apos;ll need to remove the current one first 
                by changing the task management tool to &quot;Internal&quot; in the integration settings.
              </Text>
            </Alert>
          </Stack>
        ) : null}

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