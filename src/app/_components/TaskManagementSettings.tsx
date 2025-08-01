"use client";

import { useState } from "react";
import {
  Card,
  Title,
  Text,
  Select,
  Button,
  Group,
  Stack,
  Badge,
  Alert,
  Modal,
  TextInput,
  Paper,
  ThemeIcon,
} from "@mantine/core";
import {
  IconSettings,
  IconExternalLink,
  IconCalendarEvent,
  IconDatabase,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface TaskManagementSettingsProps {
  project: {
    id: string;
    name: string;
    taskManagementTool?: string | null;
    taskManagementConfig?: any;
  };
}

interface MondayConfigForm {
  workflowId: string;
  boardId: string;
}

interface NotionConfigForm {
  workflowId: string;
  databaseId: string;
}

const TASK_MANAGEMENT_TOOLS = [
  {
    value: "internal",
    label: "Internal (Default)",
    description: "Manage tasks within this application",
    icon: IconExternalLink,
    color: "blue",
  },
  {
    value: "monday",
    label: "Monday.com",
    description: "Sync tasks to Monday.com boards",
    icon: IconCalendarEvent,
    color: "orange",
  },
  {
    value: "notion",
    label: "Notion",
    description: "Sync tasks to Notion databases",
    icon: IconDatabase,
    color: "gray",
  },
];

export function TaskManagementSettings({ project }: TaskManagementSettingsProps) {
  const [configModalOpened, { open: openConfigModal, close: closeConfigModal }] = useDisclosure(false);
  const utils = api.useUtils();

  // Get available integrations for configuration
  const { data: integrations = [] } = api.integration.listIntegrations.useQuery();
  const { data: workflows = [] } = api.workflow.list.useQuery();

  // Update task management tool mutation
  const updateTaskManagement = api.project.updateTaskManagement.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Task Management Updated',
        message: 'Project task management settings have been updated successfully.',
        color: 'green',
      });
      void utils.project.getById.invalidate({ id: project.id });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update task management settings',
        color: 'red',
      });
    },
  });

  // Monday.com configuration form
  const mondayConfigForm = useForm<MondayConfigForm>({
    initialValues: {
      workflowId: project.taskManagementConfig?.workflowId || '',
      boardId: project.taskManagementConfig?.boardId || '',
    },
    validate: {
      workflowId: (value) => !value ? 'Please select a workflow' : null,
      boardId: (value) => !value ? 'Board ID is required' : null,
    },
  });

  // Notion configuration form
  const notionConfigForm = useForm<NotionConfigForm>({
    initialValues: {
      workflowId: project.taskManagementConfig?.workflowId || '',
      databaseId: project.taskManagementConfig?.databaseId || '',
    },
    validate: {
      workflowId: (value) => !value ? 'Please select a workflow' : null,
      databaseId: (value) => !value ? 'Database ID is required' : null,
    },
  });

  const currentTool = TASK_MANAGEMENT_TOOLS.find(tool => tool.value === (project.taskManagementTool || 'internal'));
  const mondayIntegration = integrations.find(int => int.provider === 'monday' && int.status === 'ACTIVE');
  const mondayWorkflows = workflows.filter(w => w.provider === 'monday');
  const notionIntegration = integrations.find(int => int.provider === 'notion' && int.status === 'ACTIVE');
  const notionWorkflows = workflows.filter(w => w.provider === 'notion');
  
  // Debug logging
  console.log('All workflows:', workflows);
  console.log('Notion workflows:', notionWorkflows);

  const handleToolChange = async (value: string | null) => {
    if (!value) return;

    if (value === 'monday' && !mondayIntegration) {
      notifications.show({
        title: 'Monday.com Integration Required',
        message: 'Please set up a Monday.com integration first in the Workflows section.',
        color: 'orange',
      });
      return;
    }

    if (value === 'notion' && !notionIntegration) {
      notifications.show({
        title: 'Notion Integration Required',
        message: 'Please set up a Notion integration first in the Workflows section.',
        color: 'orange',
      });
      return;
    }

    if (value === 'monday' || value === 'notion') {
      // Refresh workflows before opening modal to get latest changes
      void utils.workflow.list.invalidate();
      // Open configuration modal for external tools
      openConfigModal();
    } else {
      // For other tools, update directly
      await updateTaskManagement.mutateAsync({
        id: project.id,
        taskManagementTool: value as "internal" | "monday" | "notion",
        taskManagementConfig: undefined,
      });
    }
  };

  const handleWorkflowChange = (workflowId: string | null) => {
    // First, update the form field
    mondayConfigForm.setFieldValue('workflowId', workflowId || '');

    if (!workflowId) {
      mondayConfigForm.setFieldValue('boardId', '');
      return;
    }

    // Find the selected workflow and auto-populate board ID
    const selectedWorkflow = mondayWorkflows.find(w => w.id === workflowId);
    if (selectedWorkflow?.config?.boardId) {
      mondayConfigForm.setFieldValue('boardId', selectedWorkflow.config.boardId);
    }
  };

  const handleNotionWorkflowChange = (workflowId: string | null) => {
    // First, update the form field
    notionConfigForm.setFieldValue('workflowId', workflowId || '');

    if (!workflowId) {
      notionConfigForm.setFieldValue('databaseId', '');
      return;
    }

    // Find the selected workflow and auto-populate database ID
    const selectedWorkflow = notionWorkflows.find(w => w.id === workflowId);
    if (selectedWorkflow?.config?.databaseId) {
      notionConfigForm.setFieldValue('databaseId', selectedWorkflow.config.databaseId);
    }
  };

  const handleMondayConfig = async (values: MondayConfigForm) => {
    await updateTaskManagement.mutateAsync({
      id: project.id,
      taskManagementTool: 'monday',
      taskManagementConfig: {
        workflowId: values.workflowId,
        boardId: values.boardId,
      },
    });
    closeConfigModal();
  };

  const handleNotionConfig = async (values: NotionConfigForm) => {
    await updateTaskManagement.mutateAsync({
      id: project.id,
      taskManagementTool: 'notion',
      taskManagementConfig: {
        workflowId: values.workflowId,
        databaseId: values.databaseId,
      },
    });
    closeConfigModal();
  };

  return (
    <>
      <Card withBorder>
        <Stack gap="md">
          <Group gap="sm">
            <ThemeIcon size="md" variant="light" color="teal">
              <IconSettings size={18} />
            </ThemeIcon>
            <Title order={4}>Task Management</Title>
          </Group>

          <Text size="sm" c="dimmed">
            Choose how tasks for this project should be managed. This affects where new action items 
            from meetings and workflows are created and synchronized.
          </Text>

          {/* Current Tool Display */}
          <Paper p="sm" withBorder>
            <Group justify="space-between" align="center">
              <Group gap="sm">
                <ThemeIcon 
                  size="sm" 
                  variant="light" 
                  color={currentTool?.color || 'blue'}
                >
                  {currentTool?.icon && <currentTool.icon size={14} />}
                </ThemeIcon>
                <div>
                  <Text size="sm" fw={500}>{currentTool?.label}</Text>
                  <Text size="xs" c="dimmed">{currentTool?.description}</Text>
                </div>
              </Group>
              <Badge 
                color={currentTool?.color || 'blue'} 
                variant="light"
                leftSection={<IconCheck size={12} />}
              >
                Active
              </Badge>
            </Group>
          </Paper>

          {/* Configuration Status */}
          {project.taskManagementTool === 'monday' && (
            <Alert
              icon={project.taskManagementConfig?.workflowId ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
              color={project.taskManagementConfig?.workflowId ? 'green' : 'orange'}
              variant="light"
            >
              {project.taskManagementConfig?.workflowId ? (
                <>
                  Configured with workflow: <strong>
                    {mondayWorkflows.find(w => w.id === project.taskManagementConfig?.workflowId)?.name || 
                     'Unknown Workflow'}
                  </strong>
                  {project.taskManagementConfig?.boardId && (
                    <> (Board: {project.taskManagementConfig.boardId})</>
                  )}
                </>
              ) : (
                'Monday.com integration needs configuration'
              )}
            </Alert>
          )}

          {project.taskManagementTool === 'notion' && (
            <Alert
              icon={project.taskManagementConfig?.workflowId ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
              color={project.taskManagementConfig?.workflowId ? 'green' : 'orange'}
              variant="light"
            >
              {project.taskManagementConfig?.workflowId ? (
                <>
                  Configured with workflow: <strong>
                    {notionWorkflows.find(w => w.id === project.taskManagementConfig?.workflowId)?.name || 
                     'Unknown Workflow'}
                  </strong>
                  {project.taskManagementConfig?.databaseId && (
                    <> (Database: {project.taskManagementConfig.databaseId})</>
                  )}
                </>
              ) : (
                'Notion integration needs configuration'
              )}
            </Alert>
          )}

          {/* Tool Selection */}
          <Select
            label="Task Management Tool"
            description="Select where tasks for this project should be managed"
            data={TASK_MANAGEMENT_TOOLS.map(tool => ({
              value: tool.value,
              label: tool.label,
            }))}
            value={project.taskManagementTool || 'internal'}
            onChange={handleToolChange}
            disabled={updateTaskManagement.isPending}
          />

          {/* Configuration Button */}
          {project.taskManagementTool === 'monday' && (
            <Button
              variant="light"
              leftSection={<IconSettings size={16} />}
              onClick={() => {
                void utils.workflow.list.invalidate();
                openConfigModal();
              }}
              disabled={!mondayIntegration}
            >
              {project.taskManagementConfig?.workflowId ? 'Change Workflow' : 'Select Workflow'}
            </Button>
          )}

          {project.taskManagementTool === 'notion' && (
            <Button
              variant="light"
              leftSection={<IconSettings size={16} />}
              onClick={() => {
                void utils.workflow.list.invalidate();
                openConfigModal();
              }}
              disabled={!notionIntegration}
            >
              {project.taskManagementConfig?.workflowId ? 'Change Workflow' : 'Select Workflow'}
            </Button>
          )}

          {/* Integration Status */}
          {project.taskManagementTool === 'monday' && !mondayIntegration && (
            <Alert icon={<IconAlertCircle size={16} />} color="orange" variant="light">
              No active Monday.com integration found. Please set up the integration in the Workflows section first.
            </Alert>
          )}

          {project.taskManagementTool === 'notion' && !notionIntegration && (
            <Alert icon={<IconAlertCircle size={16} />} color="orange" variant="light">
              No active Notion integration found. Please set up the integration in the Workflows section first.
            </Alert>
          )}
        </Stack>
      </Card>

      {/* Configuration Modal */}
      <Modal
        opened={configModalOpened}
        onClose={closeConfigModal}
        title={`Configure ${project.taskManagementTool === 'monday' ? 'Monday.com' : 'Notion'} Integration`}
        size="md"
      >
        {project.taskManagementTool === 'monday' ? (
          <form onSubmit={mondayConfigForm.onSubmit(handleMondayConfig)}>
            <Stack gap="md">
              <Select
                label="Monday.com Workflow"
                placeholder="Select a workflow"
                description="Choose which Monday.com workflow this project should use"
                data={mondayWorkflows.map(w => ({
                  value: w.id,
                  label: w.name,
                }))}
                value={mondayConfigForm.values.workflowId}
                onChange={handleWorkflowChange}
                error={mondayConfigForm.errors.workflowId}
                required
              />

              {mondayWorkflows.length === 0 && (
                <Alert icon={<IconAlertCircle size={16} />} color="orange" variant="light">
                  No Monday.com workflows found. You need to create a workflow first.
                </Alert>
              )}

              <Group gap="xs" mb="sm">
                <Button
                  component="a"
                  href="/workflows/monday"
                  target="_blank"
                  size="xs"
                  variant="light"
                  leftSection={<IconExternalLink size={14} />}
                >
                  {mondayWorkflows.length === 0 ? 'Create Monday.com Workflow' : 'Manage Workflows'}
                </Button>
                <Text size="xs" c="dimmed">
                  Opens in new tab
                </Text>
              </Group>

              <TextInput
                label="Board ID"
                placeholder="Auto-populated from selected workflow"
                description="The Monday.com board ID where tasks will be created"
                required
                readOnly
                {...mondayConfigForm.getInputProps('boardId')}
              />

              <Alert icon={<IconCalendarEvent size={16} />} color="blue" variant="light">
                This configuration will be used when syncing action items from meetings to your Monday.com board. 
                The board ID is automatically populated from the selected workflow configuration.
              </Alert>

              <Group justify="flex-end">
                <Button variant="light" onClick={closeConfigModal}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={updateTaskManagement.isPending}
                  leftSection={<IconCheck size={16} />}
                  disabled={!mondayConfigForm.values.workflowId || !mondayConfigForm.values.boardId}
                >
                  Save Configuration
                </Button>
              </Group>
            </Stack>
          </form>
        ) : (
          <form onSubmit={notionConfigForm.onSubmit(handleNotionConfig)}>
            <Stack gap="md">
              <Select
                label="Notion Workflow"
                placeholder="Select a workflow"
                description="Choose which Notion workflow this project should use"
                data={notionWorkflows.map(w => ({
                  value: w.id,
                  label: w.name,
                }))}
                value={notionConfigForm.values.workflowId}
                onChange={handleNotionWorkflowChange}
                error={notionConfigForm.errors.workflowId}
                required
              />

              {notionWorkflows.length === 0 && (
                <Alert icon={<IconAlertCircle size={16} />} color="orange" variant="light">
                  No Notion workflows found. You need to create a workflow first.
                </Alert>
              )}

              <Group gap="xs" mb="sm">
                <Button
                  component="a"
                  href="/workflows/notion"
                  target="_blank"
                  size="xs"
                  variant="light"
                  leftSection={<IconExternalLink size={14} />}
                >
                  {notionWorkflows.length === 0 ? 'Create Notion Workflow' : 'Manage Workflows'}
                </Button>
                <Text size="xs" c="dimmed">
                  Opens in new tab
                </Text>
              </Group>

              <TextInput
                label="Database ID"
                placeholder="Auto-populated from selected workflow"
                description="The Notion database ID where tasks will be created"
                required
                readOnly
                {...notionConfigForm.getInputProps('databaseId')}
              />

              <Alert icon={<IconDatabase size={16} />} color="blue" variant="light">
                This configuration will be used when syncing action items from meetings to your Notion database. 
                The database ID is automatically populated from the selected workflow configuration.
              </Alert>

              <Group justify="flex-end">
                <Button variant="light" onClick={closeConfigModal}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={updateTaskManagement.isPending}
                  leftSection={<IconCheck size={16} />}
                  disabled={!notionConfigForm.values.workflowId || !notionConfigForm.values.databaseId}
                >
                  Save Configuration
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    </>
  );
}