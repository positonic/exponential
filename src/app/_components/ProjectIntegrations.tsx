"use client";

import { useState } from "react";
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
  Textarea,
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

  // Get available workflows for this project
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const { data: integrations = [] } = api.integration.listIntegrations.useQuery();
  const utils = api.useUtils();

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
          databaseId: workflow.config?.databaseId || '',
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
          boardId: workflow.config?.boardId || '',
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
                            <Badge color="green" variant="light" size="sm">
                              Active
                            </Badge>
                          </Group>
                          <Text size="sm" c="dimmed" mt={2}>
                            {integration.description}
                          </Text>
                        </div>
                      </Group>
                      
                      {/* Action Buttons */}
                      <Group gap="xs">
                        <Button
                          component={Link}
                          href={integration.href}
                          size="sm" 
                          variant="light"
                          leftSection={<IconSettings size={14} />}
                        >
                          Configure
                        </Button>
                        
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
              const hasActiveIntegration = integrations.some(int => 
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
                To switch to a different task sync integration, you'll need to remove the current one first 
                by changing the task management tool to "Internal" in the integration settings.
              </Text>
            </Alert>
          </Stack>
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
    </>
  );
}