'use client';

import { useState } from 'react';
import { Container, Title, Text, Button, Card, Group, Stack, ThemeIcon, Badge, Alert, Modal, TextInput, Select, Textarea, Paper, Accordion, List, Table } from '@mantine/core';
import { IconCalendarEvent, IconArrowRight, IconCheck, IconAlertCircle, IconPlus, IconExternalLink, IconRefresh, IconEdit, IconTrash } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';

interface MondayIntegrationForm {
  name: string;
  apiKey: string;
  description?: string;
}

interface MondayWorkflowForm {
  name: string;
  boardId: string;
  syncDirection: 'push' | 'pull' | 'bidirectional';
  syncFrequency: 'manual' | 'hourly' | 'daily' | 'weekly';
  source: 'fireflies' | 'internal' | 'all';
  columnMappings: {
    assignee?: string;
    dueDate?: string;
    priority?: string;
    description?: string;
  };
}

interface MondayBoard {
  id: string;
  name: string;
  description?: string;
  columns: Array<{
    id: string;
    title: string;
    type: string;
  }>;
}

export default function MondayWorkflowPage() {
  const [integrationModalOpened, { open: openIntegrationModal, close: closeIntegrationModal }] = useDisclosure(false);
  const [workflowModalOpened, { open: openWorkflowModal, close: closeWorkflowModal }] = useDisclosure(false);
  const [editWorkflowModalOpened, { open: openEditWorkflowModal, close: closeEditWorkflowModal }] = useDisclosure(false);
  const [boardsModalOpened, { open: openBoardsModal, close: closeBoardsModal }] = useDisclosure(false);
  const [boards, setBoards] = useState<MondayBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<MondayBoard | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<any>(null);
  
  // API calls for checking configuration status
  const { data: integrations = [] } = api.integration.listIntegrations.useQuery();
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const utils = api.useUtils();

  // Test connection and get boards
  const testConnection = api.integration.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success && data.boards) {
        setBoards(data.boards);
        openBoardsModal();
      } else {
        notifications.show({
          title: 'Error',
          message: data.error || 'Failed to fetch boards',
          color: 'red',
        });
      }
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to test connection',
        color: 'red',
      });
    },
  });

  // Create integration mutation
  const createIntegration = api.integration.createIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Integration Created',
        message: 'Your Monday.com integration has been created successfully.',
        color: 'green',
      });
      closeIntegrationModal();
      integrationForm.reset();
      void utils.integration.listIntegrations.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create integration',
        color: 'red',
      });
    },
  });

  // Create workflow mutation
  const createWorkflow = api.workflow.create.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Workflow Created',
        message: 'Your Monday.com workflow has been created successfully.',
        color: 'green',
      });
      closeWorkflowModal();
      workflowForm.reset();
      setSelectedBoard(null);
      void utils.workflow.list.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create workflow',
        color: 'red',
      });
    },
  });

  // Update workflow mutation
  const updateWorkflow = api.workflow.update.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Workflow Updated',
        message: 'Your Monday.com workflow has been updated successfully.',
        color: 'green',
      });
      closeEditWorkflowModal();
      setEditingWorkflow(null);
      setSelectedBoard(null);
      void utils.workflow.list.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update workflow',
        color: 'red',
      });
    },
  });

  // Delete workflow mutation
  const deleteWorkflow = api.workflow.delete.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Workflow Deleted',
        message: 'Your Monday.com workflow has been deleted successfully.',
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

  // Forms
  const integrationForm = useForm<MondayIntegrationForm>({
    initialValues: {
      name: 'Monday.com Integration',
      apiKey: '',
      description: 'API key for Monday.com integration',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Integration name is required' : null,
      apiKey: (value) => value.trim().length === 0 ? 'API key is required' : null,
    },
  });

  const workflowForm = useForm<MondayWorkflowForm>({
    initialValues: {
      name: 'Actions → Monday.com Sync',
      boardId: '',
      syncDirection: 'push',
      syncFrequency: 'manual',
      source: 'fireflies',
      columnMappings: {},
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Workflow name is required' : null,
      boardId: (value) => value.trim().length === 0 ? 'Board selection is required' : null,
    },
  });

  const editWorkflowForm = useForm<MondayWorkflowForm>({
    initialValues: {
      name: '',
      boardId: '',
      syncDirection: 'push',
      syncFrequency: 'manual',
      source: 'fireflies',
      columnMappings: {},
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Workflow name is required' : null,
      boardId: (value) => value.trim().length === 0 ? 'Board selection is required' : null,
    },
  });

  // Check if Monday.com integration exists
  const hasMondayIntegration = integrations.some(integration => 
    integration.provider === 'monday' && 
    integration.status === 'ACTIVE'
  );

  // Get Monday.com integration
  const mondayIntegration = integrations.find(integration => 
    integration.provider === 'monday' && 
    integration.status === 'ACTIVE'
  );

  // Get Monday.com workflows
  const mondayWorkflows = workflows.filter(workflow => workflow.provider === 'monday');

  // Run workflow mutation
  const runWorkflow = api.workflow.run.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Sync Complete',
        message: `Successfully pushed ${data.itemsCreated} action items to Monday.com.`,
        color: 'green',
      });
      void utils.workflow.list.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Sync Failed',
        message: error.message || 'Failed to sync workflow',
        color: 'red',
      });
    },
  });

  const handleSyncWorkflow = (workflowId: string) => {
    runWorkflow.mutate({ id: workflowId });
  };

  const handleCreateIntegration = async (values: MondayIntegrationForm) => {
    await createIntegration.mutateAsync({
      name: values.name,
      provider: 'monday',
      apiKey: values.apiKey,
      description: values.description,
    });
  };

  const handleCreateWorkflow = async (values: MondayWorkflowForm) => {
    if (!mondayIntegration) {
      notifications.show({
        title: 'Error',
        message: 'No Monday.com integration found',
        color: 'red',
      });
      return;
    }

    await createWorkflow.mutateAsync({
      name: values.name,
      type: 'MONDAY_ACTIONS',
      provider: 'monday',
      syncDirection: values.syncDirection,
      syncFrequency: values.syncFrequency,
      integrationId: mondayIntegration.id,
      config: {
        boardId: values.boardId,
        columnMappings: values.columnMappings,
        source: values.source,
      },
    });
  };

  const handleSelectBoard = (board: MondayBoard) => {
    setSelectedBoard(board);
    workflowForm.setFieldValue('boardId', board.id);
    closeBoardsModal();
    
    // Debug: Log all column types to console
    console.log('Board columns:', board.columns.map(col => ({ 
      title: col.title, 
      type: col.type 
    })));
  };

  const handleEditWorkflow = (workflow: any) => {
    setEditingWorkflow(workflow);
    
    // Parse the config to get board and column mappings
    const config = workflow.config || {};
    
    editWorkflowForm.setValues({
      name: workflow.name,
      boardId: config.boardId || '',
      syncDirection: workflow.syncDirection,
      syncFrequency: workflow.syncFrequency,
      source: config.source || 'fireflies',
      columnMappings: config.columnMappings || {},
    });

    // If we have a boardId, we need to fetch boards to set the selected board
    if (config.boardId && mondayIntegration) {
      testConnection.mutate({ integrationId: mondayIntegration.id });
    }
    
    openEditWorkflowModal();
  };

  const handleUpdateWorkflow = async (values: MondayWorkflowForm) => {
    if (!editingWorkflow || !mondayIntegration) {
      notifications.show({
        title: 'Error',
        message: 'No workflow selected for editing',
        color: 'red',
      });
      return;
    }

    await updateWorkflow.mutateAsync({
      id: editingWorkflow.id,
      name: values.name,
      syncDirection: values.syncDirection,
      syncFrequency: values.syncFrequency,
      config: {
        boardId: values.boardId,
        columnMappings: values.columnMappings,
        source: values.source,
      },
    });
  };

  const handleDeleteWorkflow = (workflowId: string, workflowName: string) => {
    if (confirm(`Are you sure you want to delete the workflow "${workflowName}"? This action cannot be undone.`)) {
      deleteWorkflow.mutate({ id: workflowId });
    }
  };

  const getColumnOptions = (columnType: string) => {
    if (!selectedBoard) return [];
    
    // Map our expected types to Monday.com's actual column types
    const typeMapping: Record<string, string[]> = {
      'person': ['people', 'person'],  // Monday.com uses 'people' for person columns
      'date': ['date'],
      'status': ['color', 'status'],   // Monday.com often uses 'color' for status columns
      'long-text': ['long-text', 'doc', 'text', 'long_text', 'large_text', 'textarea'], // Various text column types
    };
    
    const allowedTypes = typeMapping[columnType] || [columnType];
    
    const filteredColumns = selectedBoard.columns
      .filter(col => allowedTypes.includes(col.type));
    
    // Debug logging for description column specifically
    if (columnType === 'long-text') {
      console.log('Debug - Looking for long-text columns');
      console.log('Allowed types:', allowedTypes);
      console.log('All columns:', selectedBoard.columns.map(col => ({ title: col.title, type: col.type })));
      console.log('Filtered columns:', filteredColumns.map(col => ({ title: col.title, type: col.type })));
    }
    
    return filteredColumns.map(col => ({ value: col.id, label: `${col.title} (${col.type})` }));
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Group gap="md" mb="xs">
            <ThemeIcon size="lg" variant="light" color="blue">
              <IconCalendarEvent size={24} />
            </ThemeIcon>
            <div>
              <Title order={2}>Monday.com Integration</Title>
              <Text c="dimmed">Push your action items to Monday.com boards</Text>
            </div>
          </Group>
        </div>

        {/* Integration Status */}
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text fw={600} size="lg">Integration Status</Text>
                <Text size="sm" c="dimmed">Connect your Monday.com workspace</Text>
              </div>
              <Badge 
                color={hasMondayIntegration ? 'green' : 'gray'} 
                variant={hasMondayIntegration ? 'filled' : 'outline'}
              >
                {hasMondayIntegration ? 'Connected' : 'Not Connected'}
              </Badge>
            </Group>

            {!hasMondayIntegration && (
              <Alert icon={<IconAlertCircle size={16} />} color="blue">
                You need to create a Monday.com integration first. Click the button below to add your API key.
              </Alert>
            )}

            <Group>
              {!hasMondayIntegration ? (
                <Button 
                  leftSection={<IconPlus size={16} />}
                  onClick={openIntegrationModal}
                >
                  Add Monday.com Integration
                </Button>
              ) : (
                <Button 
                  variant="light" 
                  leftSection={<IconRefresh size={16} />}
                  onClick={() => testConnection.mutate({ integrationId: mondayIntegration!.id })}
                  loading={testConnection.isPending}
                >
                  Test Connection & View Boards
                </Button>
              )}
              <Button 
                component={Link} 
                href="/integrations" 
                variant="subtle"
                rightSection={<IconExternalLink size={16} />}
              >
                Manage Integrations
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Workflows */}
        {hasMondayIntegration && (
          <Card withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Text fw={600} size="lg">Monday.com Workflows</Text>
                  <Text size="sm" c="dimmed">Automated syncing to your Monday.com boards</Text>
                </div>
                <Button 
                  leftSection={<IconPlus size={16} />}
                  onClick={openWorkflowModal}
                >
                  Create Workflow
                </Button>
              </Group>

              {mondayWorkflows.length === 0 ? (
                <Alert icon={<IconAlertCircle size={16} />} color="blue">
                  No workflows configured yet. Create your first workflow to start syncing action items to Monday.com.
                </Alert>
              ) : (
                <Stack gap="sm">
                  {mondayWorkflows.map((workflow) => (
                    <Paper key={workflow.id} withBorder p="md">
                      <Group justify="space-between">
                        <div>
                          <Text fw={600}>{workflow.name}</Text>
                          <Text size="sm" c="dimmed">
                            {workflow.syncDirection} sync • {workflow.syncFrequency}
                          </Text>
                          <Group gap="xs" mt={4}>
                            <Badge size="xs" variant="outline">
                              {workflow.syncDirection}
                            </Badge>
                            <Badge size="xs" variant="outline">
                              {workflow.syncFrequency}
                            </Badge>
                            <Badge 
                              size="xs" 
                              color={workflow.status === 'ACTIVE' ? 'green' : 'gray'}
                            >
                              {workflow.status}
                            </Badge>
                          </Group>
                        </div>
                        <Group gap="xs">
                          <Button 
                            size="xs" 
                            variant="light"
                            onClick={() => handleSyncWorkflow(workflow.id)}
                            loading={runWorkflow.isPending}
                          >
                            Sync Now
                          </Button>
                          <Button 
                            size="xs" 
                            variant="outline"
                            leftSection={<IconEdit size={12} />}
                            onClick={() => handleEditWorkflow(workflow)}
                          >
                            Edit
                          </Button>
                          <Button 
                            size="xs" 
                            variant="outline"
                            color="red"
                            leftSection={<IconTrash size={12} />}
                            onClick={() => handleDeleteWorkflow(workflow.id, workflow.name)}
                            loading={deleteWorkflow.isPending}
                          >
                            Delete
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        )}

        {/* How it Works */}
        <Card withBorder>
          <Stack gap="md">
            <Text fw={600} size="lg">How It Works</Text>
            <List
              spacing="xs"
              size="sm"
              center
              icon={<ThemeIcon size={20} radius="xl"><IconArrowRight size={12} /></ThemeIcon>}
            >
              <List.Item>Connect your Monday.com workspace with your personal API token</List.Item>
              <List.Item>Select which board you want to sync action items to</List.Item>
              <List.Item>Configure column mappings for assignees, due dates, and priorities</List.Item>
              <List.Item>Choose whether to sync all actions or just those from Fireflies meetings</List.Item>
              <List.Item>Your action items will be automatically pushed to Monday.com</List.Item>
            </List>
          </Stack>
        </Card>
      </Stack>

      {/* Integration Modal */}
      <Modal 
        opened={integrationModalOpened} 
        onClose={closeIntegrationModal}
        title="Add Monday.com Integration"
        size="md"
      >
        <form onSubmit={integrationForm.onSubmit(handleCreateIntegration)}>
          <Stack gap="md">
            <TextInput
              label="Integration Name"
              placeholder="e.g., My Monday.com Workspace"
              required
              {...integrationForm.getInputProps('name')}
            />

            <TextInput
              label="API Key"
              placeholder="Enter your Monday.com API key"
              required
              type="password"
              {...integrationForm.getInputProps('apiKey')}
            />

            <Textarea
              label="Description (Optional)"
              placeholder="What will this integration be used for?"
              {...integrationForm.getInputProps('description')}
              minRows={2}
            />

            <Alert 
              icon={<IconAlertCircle size={16} />}
              title="Monday.com Setup"
              color="blue"
            >
              Get your personal API token from Monday.com by going to{' '}
              <Text component="a" href="https://your-workspace.monday.com/admin/integrations/api" target="_blank" style={{ textDecoration: 'underline' }}>
                /admin/integrations/api
              </Text>{' '}
              and clicking 'Generate' next to "Personal API Token". Your token will be tested to ensure it has access to your boards.
            </Alert>

            <Group justify="flex-end">
              <Button variant="light" onClick={closeIntegrationModal}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                loading={createIntegration.isPending}
              >
                Create Integration
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Boards Modal */}
      <Modal 
        opened={boardsModalOpened} 
        onClose={closeBoardsModal}
        title="Select Monday.com Board"
        size="lg"
        zIndex={1001}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Choose which Monday.com board you want to sync your action items to:
          </Text>
          
          {boards.length === 0 ? (
            <Alert icon={<IconAlertCircle size={16} />} color="orange">
              No boards found. Make sure your API key has access to boards in your Monday.com workspace.
            </Alert>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Board Name</Table.Th>
                  <Table.Th>Columns</Table.Th>
                  <Table.Th>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {boards.map((board) => (
                  <Table.Tr key={board.id}>
                    <Table.Td>
                      <div>
                        <Text fw={500}>{board.name}</Text>
                        {board.description && (
                          <Text size="xs" c="dimmed">{board.description}</Text>
                        )}
                      </div>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {board.columns.slice(0, 3).map((col) => (
                          <Badge key={col.id} size="xs" variant="outline">
                            {col.title} ({col.type})
                          </Badge>
                        ))}
                        {board.columns.length > 3 && (
                          <Badge size="xs" variant="outline" color="gray">
                            +{board.columns.length - 3} more
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Button 
                        size="xs" 
                        onClick={() => handleSelectBoard(board)}
                      >
                        Select
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          
          <Group justify="flex-end">
            <Button variant="light" onClick={closeBoardsModal}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Workflow Modal */}
      <Modal 
        opened={workflowModalOpened} 
        onClose={closeWorkflowModal}
        title="Create Monday.com Workflow"
        size="lg"
      >
        <form onSubmit={workflowForm.onSubmit(handleCreateWorkflow)}>
          <Stack gap="md">
            <TextInput
              label="Workflow Name"
              placeholder="e.g., Fireflies → Monday.com Sync"
              required
              {...workflowForm.getInputProps('name')}
            />

            <Group grow>
              <div>
                <Text size="sm" fw={500} mb={5}>Selected Board</Text>
                {selectedBoard ? (
                  <Paper withBorder p="sm">
                    <Group justify="space-between">
                      <Text size="sm">{selectedBoard.name}</Text>
                      <Button 
                        size="xs" 
                        variant="light"
                        onClick={() => testConnection.mutate({ integrationId: mondayIntegration!.id })}
                      >
                        Change Board
                      </Button>
                    </Group>
                  </Paper>
                ) : (
                  <Button 
                    variant="outline" 
                    fullWidth
                    onClick={() => testConnection.mutate({ integrationId: mondayIntegration!.id })}
                    loading={testConnection.isPending}
                  >
                    Select Board
                  </Button>
                )}
              </div>
            </Group>

            {selectedBoard && (
              <>
                <Text fw={500} size="sm">Column Mappings (Optional)</Text>
                <Text size="xs" c="dimmed" mb="xs">
                  Map your action fields to Monday.com board columns:
                </Text>
                
                {/* Debug: Show all available columns */}
                <Paper withBorder p="xs" mb="sm">
                  <Text size="xs" fw={500} mb={4}>Available columns on "{selectedBoard.name}":</Text>
                  <Group gap="xs">
                    {selectedBoard.columns.map((col) => (
                      <Badge key={col.id} size="xs" variant="outline">
                        {col.title} ({col.type})
                      </Badge>
                    ))}
                  </Group>
                </Paper>
                
                <Group grow>
                  <Select
                    label="Assignee Column"
                    placeholder="Select person column"
                    data={getColumnOptions('person')}
                    {...workflowForm.getInputProps('columnMappings.assignee')}
                    clearable
                  />
                  <Select
                    label="Due Date Column"
                    placeholder="Select date column"
                    data={getColumnOptions('date')}
                    {...workflowForm.getInputProps('columnMappings.dueDate')}
                    clearable
                  />
                </Group>

                <Group grow>
                  <Select
                    label="Priority Column"
                    placeholder="Select status column"
                    data={getColumnOptions('status')}
                    {...workflowForm.getInputProps('columnMappings.priority')}
                    clearable
                  />
                  <Select
                    label="Description Column"
                    placeholder="Select long text column"
                    data={getColumnOptions('long-text')}
                    {...workflowForm.getInputProps('columnMappings.description')}
                    clearable
                  />
                </Group>
              </>
            )}

            <Select
              label="Action Source"
              description="Choose which actions to sync to Monday.com"
              data={[
                { value: 'fireflies', label: 'Fireflies meetings only' },
                { value: 'internal', label: 'Internal actions only' },
                { value: 'all', label: 'All actions' },
              ]}
              {...workflowForm.getInputProps('source')}
            />

            <Group grow>
              <Select
                label="Sync Direction"
                data={[
                  { value: 'push', label: 'Push to Monday.com' },
                  { value: 'pull', label: 'Pull from Monday.com' },
                  { value: 'bidirectional', label: 'Bidirectional' },
                ]}
                {...workflowForm.getInputProps('syncDirection')}
              />
              <Select
                label="Sync Frequency"
                data={[
                  { value: 'manual', label: 'Manual only' },
                  { value: 'hourly', label: 'Every hour' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                ]}
                {...workflowForm.getInputProps('syncFrequency')}
              />
            </Group>


            <Group justify="flex-end">
              <Button variant="light" onClick={closeWorkflowModal}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                loading={createWorkflow.isPending}
                disabled={!selectedBoard}
              >
                Create Workflow
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Edit Workflow Modal */}
      <Modal 
        opened={editWorkflowModalOpened} 
        onClose={closeEditWorkflowModal}
        title="Edit Monday.com Workflow"
        size="lg"
      >
        <form onSubmit={editWorkflowForm.onSubmit(handleUpdateWorkflow)}>
          <Stack gap="md">
            <TextInput
              label="Workflow Name"
              placeholder="e.g., Fireflies → Monday.com Sync"
              required
              {...editWorkflowForm.getInputProps('name')}
            />

            <Group grow>
              <div>
                <Text size="sm" fw={500} mb={5}>Current Board</Text>
                {editingWorkflow?.config?.boardId ? (
                  <Paper withBorder p="sm">
                    <Group justify="space-between">
                      <Text size="sm">
                        Board ID: {editingWorkflow.config.boardId}
                      </Text>
                      <Button 
                        size="xs" 
                        variant="light"
                        onClick={() => testConnection.mutate({ integrationId: mondayIntegration!.id })}
                      >
                        Change Board
                      </Button>
                    </Group>
                  </Paper>
                ) : (
                  <Button 
                    variant="outline" 
                    fullWidth
                    onClick={() => testConnection.mutate({ integrationId: mondayIntegration!.id })}
                    loading={testConnection.isPending}
                  >
                    Select Board
                  </Button>
                )}
              </div>
            </Group>

            {selectedBoard && (
              <>
                <Text fw={500} size="sm">Column Mappings (Optional)</Text>
                <Text size="xs" c="dimmed" mb="xs">
                  Map your action fields to Monday.com board columns:
                </Text>
                
                {/* Debug: Show all available columns */}
                <Paper withBorder p="xs" mb="sm">
                  <Text size="xs" fw={500} mb={4}>Available columns on "{selectedBoard.name}":</Text>
                  <Group gap="xs">
                    {selectedBoard.columns.map((col) => (
                      <Badge key={col.id} size="xs" variant="outline">
                        {col.title} ({col.type})
                      </Badge>
                    ))}
                  </Group>
                </Paper>
                
                <Group grow>
                  <Select
                    label="Assignee Column"
                    placeholder="Select person column"
                    data={getColumnOptions('person')}
                    {...editWorkflowForm.getInputProps('columnMappings.assignee')}
                    clearable
                  />
                  <Select
                    label="Due Date Column"
                    placeholder="Select date column"
                    data={getColumnOptions('date')}
                    {...editWorkflowForm.getInputProps('columnMappings.dueDate')}
                    clearable
                  />
                </Group>

                <Group grow>
                  <Select
                    label="Priority Column"
                    placeholder="Select status column"
                    data={getColumnOptions('status')}
                    {...editWorkflowForm.getInputProps('columnMappings.priority')}
                    clearable
                  />
                  <Select
                    label="Description Column"
                    placeholder="Select long text column"
                    data={getColumnOptions('long-text')}
                    {...editWorkflowForm.getInputProps('columnMappings.description')}
                    clearable
                  />
                </Group>
              </>
            )}

            <Select
              label="Action Source"
              description="Choose which actions to sync to Monday.com"
              data={[
                { value: 'fireflies', label: 'Fireflies meetings only' },
                { value: 'internal', label: 'Internal actions only' },
                { value: 'all', label: 'All actions' },
              ]}
              {...editWorkflowForm.getInputProps('source')}
            />

            <Group grow>
              <Select
                label="Sync Direction"
                data={[
                  { value: 'push', label: 'Push to Monday.com' },
                  { value: 'pull', label: 'Pull from Monday.com' },
                  { value: 'bidirectional', label: 'Bidirectional' },
                ]}
                {...editWorkflowForm.getInputProps('syncDirection')}
              />
              <Select
                label="Sync Frequency"
                data={[
                  { value: 'manual', label: 'Manual only' },
                  { value: 'hourly', label: 'Every hour' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                ]}
                {...editWorkflowForm.getInputProps('syncFrequency')}
              />
            </Group>

            <Group justify="flex-end">
              <Button variant="light" onClick={closeEditWorkflowModal}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                loading={updateWorkflow.isPending}
              >
                Update Workflow
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}