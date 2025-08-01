'use client';

import { useState } from 'react';
import { Container, Title, Text, Button, Card, Group, Stack, ThemeIcon, Badge, Alert, Modal, TextInput, Select, Textarea, Paper, Accordion, List, Table } from '@mantine/core';
import { IconDatabase, IconArrowRight, IconCheck, IconAlertCircle, IconPlus, IconBrandNotion, IconExternalLink, IconEdit, IconTrash } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';

interface NotionIntegrationForm {
  name: string;
  apiKey: string;
  description?: string;
}

interface NotionWorkflowForm {
  name: string;
  databaseId: string;
  syncDirection: 'push' | 'pull' | 'bidirectional';
  syncFrequency: 'manual' | 'hourly' | 'daily' | 'weekly';
  source: 'fireflies' | 'internal' | 'all';
  propertyMappings: {
    title?: string;
    assignee?: string;
    dueDate?: string;
    priority?: string;
    description?: string;
  };
}

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties?: Record<string, NotionProperty>;
}

interface NotionProperty {
  id: string;
  name: string;
  type: string;
}

export default function NotionWorkflowPage() {
  const [integrationModalOpened, { open: openIntegrationModal, close: closeIntegrationModal }] = useDisclosure(false);
  const [workflowModalOpened, { open: openWorkflowModal, close: closeWorkflowModal }] = useDisclosure(false);
  const [editWorkflowModalOpened, { open: openEditWorkflowModal, close: closeEditWorkflowModal }] = useDisclosure(false);
  const [databasesModalOpened, { open: openDatabasesModal, close: closeDatabasesModal }] = useDisclosure(false);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<NotionDatabase | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<any>(null);
  
  // API calls for checking configuration status
  const { data: integrations = [] } = api.integration.listIntegrations.useQuery();
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const utils = api.useUtils();

  // Test connection and get databases
  const testConnection = api.integration.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success && data.databases) {
        setDatabases(data.databases);
        
        // If we're editing a workflow and have a databaseId, set the selected database
        if (editingWorkflow && editingWorkflow.config?.databaseId) {
          const currentDatabase = data.databases.find(db => db.id === editingWorkflow.config.databaseId);
          if (currentDatabase) {
            setSelectedDatabase(currentDatabase);
          }
        }
        
        openDatabasesModal();
      } else {
        notifications.show({
          title: 'Error',
          message: data.error || 'Failed to fetch databases',
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
        message: 'Your Notion integration has been created successfully.',
        color: 'green',
      });
      closeIntegrationModal();
      integrationForm.reset();
      // Invalidate integrations cache to update the UI immediately
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

  // Forms
  const integrationForm = useForm<NotionIntegrationForm>({
    initialValues: {
      name: 'Notion Integration',
      apiKey: '',
      description: 'API key for Notion integration',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Integration name is required' : null,
      apiKey: (value) => value.trim().length === 0 ? 'API key is required' : null,
    },
  });

  const workflowForm = useForm<NotionWorkflowForm>({
    initialValues: {
      name: 'Actions → Notion Sync',
      databaseId: '',
      syncDirection: 'push',
      syncFrequency: 'manual',
      source: 'fireflies',
      propertyMappings: {
        title: '',
        assignee: '',
        dueDate: '',
        priority: '',
        description: '',
      },
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Workflow name is required' : null,
      databaseId: (value) => value.trim().length === 0 ? 'Database selection is required' : null,
    },
  });

  const editWorkflowForm = useForm<NotionWorkflowForm>({
    initialValues: {
      name: '',
      databaseId: '',
      syncDirection: 'push',
      syncFrequency: 'manual',
      source: 'fireflies',
      propertyMappings: {
        title: '',
        assignee: '',
        dueDate: '',
        priority: '',
        description: '',
      },
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Workflow name is required' : null,
      databaseId: (value) => value.trim().length === 0 ? 'Database selection is required' : null,
    },
  });

  // Check if Notion integration exists
  const hasNotionIntegration = integrations.some(integration => 
    integration.provider === 'notion' && 
    integration.status === 'ACTIVE'
  );

  // Get the active Notion integration
  const notionIntegration = integrations.find(integration => 
    integration.provider === 'notion' && 
    integration.status === 'ACTIVE'
  );

  // Get Notion workflows
  const notionWorkflows = workflows.filter(workflow => workflow.provider === 'notion');

  // Run workflow mutation
  const runWorkflow = api.workflow.run.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Sync Complete',
        message: `Successfully synced ${data.itemsCreated} new tasks and updated ${data.itemsUpdated} existing tasks.`,
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

  const handleCreateIntegration = async (values: NotionIntegrationForm) => {
    await createIntegration.mutateAsync({
      name: values.name,
      provider: 'notion',
      apiKey: values.apiKey,
      description: values.description,
    });
  };

  const handleTestDatabases = () => {
    if (notionIntegration) {
      testConnection.mutate({ integrationId: notionIntegration.id });
    }
  };

  // Create workflow mutation
  const createWorkflow = api.workflow.create.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Workflow Created',
        message: 'Your Notion workflow has been configured successfully.',
        color: 'green',
      });
      closeWorkflowModal();
      workflowForm.reset();
      setSelectedDatabase(null);
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
        message: 'Your Notion workflow has been updated successfully.',
        color: 'green',
      });
      closeEditWorkflowModal();
      editWorkflowForm.reset();
      setEditingWorkflow(null);
      setSelectedDatabase(null);
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
        message: 'Your Notion workflow has been deleted successfully.',
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

  const handleCreateWorkflow = async (values: NotionWorkflowForm) => {
    if (!notionIntegration) {
      notifications.show({
        title: 'Error',
        message: 'No active Notion integration found',
        color: 'red',
      });
      return;
    }

    await createWorkflow.mutateAsync({
      name: values.name,
      type: 'NOTION_SYNC',
      provider: 'notion',
      syncDirection: values.syncDirection,
      syncFrequency: values.syncFrequency,
      integrationId: notionIntegration.id,
      config: {
        databaseId: values.databaseId,
        source: values.source,
        propertyMappings: values.propertyMappings,
      },
      description: values.description,
    });
  };

  const handleUpdateWorkflow = async (values: NotionWorkflowForm) => {
    if (!editingWorkflow) {
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
        databaseId: values.databaseId,
        source: values.source,
        propertyMappings: values.propertyMappings,
      },
    });
  };

  const handleEditWorkflow = (workflow: any) => {
    setEditingWorkflow(workflow);
    editWorkflowForm.setValues({
      name: workflow.name,
      databaseId: workflow.config?.databaseId || '',
      syncDirection: workflow.syncDirection || 'push',
      syncFrequency: workflow.syncFrequency || 'manual',
      source: workflow.config?.source || 'fireflies',
      propertyMappings: {
        title: workflow.config?.propertyMappings?.title || '',
        assignee: workflow.config?.propertyMappings?.assignee || '',
        dueDate: workflow.config?.propertyMappings?.dueDate || '',
        priority: workflow.config?.propertyMappings?.priority || '',
        description: workflow.config?.propertyMappings?.description || '',
      },
    });
    
    // If we have a databaseId, try to fetch databases and set selected database
    if (workflow.config?.databaseId) {
      if (notionIntegration) {
        testConnection.mutate({ integrationId: notionIntegration.id });
      }
    }
    
    openEditWorkflowModal();
  };

  const handleDeleteWorkflow = (workflowId: string, workflowName: string) => {
    if (confirm(`Are you sure you want to delete the workflow "${workflowName}"?`)) {
      deleteWorkflow.mutate({ id: workflowId });
    }
  };

  const handleSelectDatabase = (database: NotionDatabase) => {
    setSelectedDatabase(database);
    
    // If we're editing a workflow, update the form
    if (editingWorkflow) {
      editWorkflowForm.setFieldValue('databaseId', database.id);
    } else {
      // For new workflows, update the workflow form
      workflowForm.setFieldValue('databaseId', database.id);
    }
    
    // Close the databases modal
    closeDatabasesModal();
    
    notifications.show({
      title: 'Database Selected',
      message: `Selected database: ${database.title}`,
      color: 'green',
    });
  };

  // Helper function to get property options by type
  const getPropertyOptions = (type: string) => {
    if (!selectedDatabase || !selectedDatabase.properties) return [];
    
    console.log('Getting properties for type:', type);
    console.log('Available properties:', selectedDatabase.properties);
    
    // Define type mappings
    let typesToCheck: string[] = [];
    switch (type) {
      case 'person':
        typesToCheck = ['person', 'people'];
        break;
      case 'text':
        typesToCheck = ['rich_text', 'text'];
        break;
      case 'title':
        typesToCheck = ['title'];
        break;
      default:
        typesToCheck = [type];
    }
    
    return Object.entries(selectedDatabase.properties)
      .filter(([_, prop]) => typesToCheck.includes(prop.type))
      .map(([key, prop]) => ({
        value: key,
        label: `${prop.name} (${prop.type})`,
      }));
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        <div>
          <Title
            order={1}
            ta="center"
            className="mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-4xl font-bold text-transparent"
          >
            Notion Integration Workflow
          </Title>
          <Text c="dimmed" size="xl" ta="center">
            Sync your tasks and projects between this application and your Notion databases.
          </Text>
        </div>

        {/* Main Integration Card */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="md">
            <Group align="center">
              <ThemeIcon size="lg" variant="light" color="blue" radius="md">
                <IconBrandNotion size={24} />
              </ThemeIcon>
              <div>
                <Title order={4} className="text-lg font-semibold">
                  Notion Database Sync
                </Title>
                <Badge 
                  color={hasNotionIntegration ? 'green' : 'orange'} 
                  variant="light" 
                  size="sm"
                >
                  {hasNotionIntegration ? 'Connected' : 'Setup Required'}
                </Badge>
              </div>
            </Group>
            {hasNotionIntegration && (
              <ThemeIcon size="md" variant="light" color="green" radius="xl">
                <IconCheck size={16} />
              </ThemeIcon>
            )}
          </Group>

          <Text size="sm" c="dimmed" mb="md">
            Automatically push and pull data from your Notion databases to keep your tasks synchronized across platforms. Perfect for teams using Notion as their knowledge base while managing tasks here.
          </Text>

          {/* Configuration Status Alert */}
          {hasNotionIntegration ? (
            <>
              <Alert 
                icon={<IconCheck size={16} />}
                title="Notion Connected!"
                color="green"
                variant="light"
                mb="md"
              >
                Your Notion integration is connected and ready to sync with databases.
              </Alert>
              {notionWorkflows.length === 0 && (
                <Alert
                  icon={<IconAlertCircle size={16} />}
                  title="No workflows configured"
                  color="red"
                  variant="light"
                  mb="md"
                >
                  You need to configure at least one workflow to sync data with Notion.
                </Alert>
              )}
            </>
          ) : (
            <Alert 
              icon={<IconAlertCircle size={16} />}
              title="Notion Integration Required"
              color="orange"
              variant="light"
              mb="md"
            >
              Add your Notion internal integration secret to start syncing tasks and projects.
            </Alert>
          )}

          {/* Setup Steps Accordion */}
          <Accordion variant="contained" mb="md">
            <Accordion.Item value="setup">
              <Accordion.Control>
                <Group gap="sm">
                  <Text fw={500}>Workflow Setup Steps</Text>
                  {hasNotionIntegration && (
                    <Badge color="green" size="sm" variant="filled">Ready</Badge>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  {/* Step 1: Create Notion Integration */}
                  <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                    <Group justify="space-between" align="flex-start" mb="xs">
                      <Group gap="sm">
                        <ThemeIcon 
                          size="sm" 
                          variant="filled" 
                          color={hasNotionIntegration ? 'green' : 'blue'} 
                          radius="xl"
                        >
                          {hasNotionIntegration ? <IconCheck size={12} /> : <Text size="xs">1</Text>}
                        </ThemeIcon>
                        <Text size="sm" fw={500}>Create Notion Internal Integration</Text>
                      </Group>
                      <Button
                        size="xs"
                        variant="subtle"
                        rightSection={<IconExternalLink size={12} />}
                        component="a"
                        href="https://www.notion.so/my-integrations"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open Notion
                      </Button>
                    </Group>
                    <Text size="xs" c="dimmed" ml="xl" mb="xs">
                      Create a new internal integration in your Notion workspace:
                    </Text>
                    <List size="xs" ml="xl" c="dimmed">
                      <List.Item>Go to Settings & Members → Integrations</List.Item>
                      <List.Item>Click &quot;Develop your own integrations&quot;</List.Item>
                      <List.Item>Create new integration with read/write capabilities</List.Item>
                      <List.Item>Copy the Internal Integration Secret</List.Item>
                    </List>
                  </Paper>

                  {/* Step 2: Add Integration Secret */}
                  <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                    <Group justify="space-between" align="center" mb="xs">
                      <Group gap="sm">
                        <ThemeIcon 
                          size="sm" 
                          variant="filled" 
                          color={hasNotionIntegration ? 'green' : 'gray'} 
                          radius="xl"
                        >
                          {hasNotionIntegration ? <IconCheck size={12} /> : <Text size="xs">2</Text>}
                        </ThemeIcon>
                        <Text size="sm" fw={500}>Add Integration Secret</Text>
                      </Group>
                      {hasNotionIntegration ? (
                        <Badge color="green" size="xs" variant="light">Configured</Badge>
                      ) : (
                        <Button 
                          size="xs" 
                          variant="light" 
                          leftSection={<IconPlus size={12} />}
                          onClick={openIntegrationModal}
                        >
                          Add Secret
                        </Button>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed" ml="xl">
                      Add your Notion internal integration secret to connect your workspace.
                    </Text>
                  </Paper>

                  {/* Step 3: Share Database */}
                  <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                    <Group justify="space-between" align="flex-start" mb="xs">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="filled" color={hasNotionIntegration ? 'blue' : 'gray'} radius="xl">
                          <Text size="xs">3</Text>
                        </ThemeIcon>
                        <Text size="sm" fw={500}>Share Database with Integration</Text>
                      </Group>
                      {hasNotionIntegration && (
                        <Button
                          size="xs"
                          variant="light"
                          onClick={handleTestDatabases}
                          loading={testConnection.isPending}
                        >
                          Test Access
                        </Button>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed" ml="xl" mb="xs">
                      In Notion, share your database with the integration:
                    </Text>
                    <List size="xs" ml="xl" c="dimmed">
                      <List.Item>Open your Notion database</List.Item>
                      <List.Item>Click Share → Invite</List.Item>
                      <List.Item>Select your integration from the list</List.Item>
                      <List.Item>Grant appropriate permissions</List.Item>
                    </List>
                  </Paper>

                  {/* Step 4: Configure Sync */}
                  <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800/50">
                    <Group justify="space-between" align="center" mb="xs">
                      <Group gap="sm">
                        <ThemeIcon 
                          size="sm" 
                          variant="filled" 
                          color="gray" 
                          radius="xl"
                        >
                          <Text size="xs">4</Text>
                        </ThemeIcon>
                        <Text size="sm" fw={500}>Configure Database Sync</Text>
                      </Group>
                      {hasNotionIntegration ? (
                        <Button 
                          size="xs" 
                          variant="light" 
                          leftSection={<IconPlus size={12} />}
                          onClick={openWorkflowModal}
                        >
                          Setup Sync
                        </Button>
                      ) : (
                        <Badge color="gray" size="xs" variant="light">Requires Integration</Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed" ml="xl">
                      Configure which database to sync and set sync preferences.
                    </Text>
                  </Paper>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          {/* Workflow Features */}
          <Stack gap="sm" mb="md">
            <Text size="sm" fw={500} c="dimmed">Workflow Features:</Text>
            <Group gap="xs">
              <Badge variant="light" color="blue" size="sm">Bidirectional Sync</Badge>
              <Badge variant="light" color="green" size="sm">Real-time Updates</Badge>
              <Badge variant="light" color="purple" size="sm">Field Mapping</Badge>
              <Badge variant="light" color="teal" size="sm">Batch Operations</Badge>
            </Group>
          </Stack>

          <Button
            variant={hasNotionIntegration ? "light" : "filled"}
            color="blue"
            size="sm"
            leftSection={<IconDatabase size={16} />}
            disabled={!hasNotionIntegration}
            onClick={hasNotionIntegration ? openWorkflowModal : openIntegrationModal}
          >
            {hasNotionIntegration ? 'Configure Workflow' : 'Add Notion Integration'}
          </Button>
        </Card>

        {/* Integration Creation Modal */}
        <Modal 
          opened={integrationModalOpened} 
          onClose={closeIntegrationModal}
          title="Add Notion Integration"
          size="md"
        >
          <form onSubmit={integrationForm.onSubmit(handleCreateIntegration)}>
            <Stack gap="md">
              <TextInput
                label="Integration Name"
                placeholder="e.g., My Notion Workspace"
                required
                {...integrationForm.getInputProps('name')}
              />

              <TextInput
                label="Internal Integration Secret"
                placeholder="secret_..."
                description="Your Notion internal integration secret"
                required
                type="password"
                {...integrationForm.getInputProps('apiKey')}
              />

              <Textarea
                label="Description"
                placeholder="Optional description for this integration"
                {...integrationForm.getInputProps('description')}
                minRows={2}
              />

              <Alert 
                icon={<IconBrandNotion size={16} />}
                title="Security Note"
                color="blue"
              >
                Your integration secret is stored securely and will only be used to sync data between your Notion workspace and this application.
              </Alert>

              <Group justify="flex-end">
                <Button variant="light" onClick={closeIntegrationModal}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  loading={createIntegration.isPending}
                  leftSection={<IconPlus size={16} />}
                >
                  Create Integration
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>

        {/* Workflow Modal */}
        <Modal 
          opened={workflowModalOpened} 
          onClose={closeWorkflowModal}
          title="Create Notion Workflow"
          size="xl"
          styles={{
            body: { maxHeight: '80vh', overflowY: 'auto' },
            content: { maxHeight: '90vh' }
          }}
        >
          <form onSubmit={workflowForm.onSubmit(handleCreateWorkflow)}>
            <Stack gap="md">
              <TextInput
                label="Workflow Name"
                placeholder="e.g., Actions → Notion Sync"
                required
                {...workflowForm.getInputProps('name')}
              />

              <Group grow>
                <div>
                  <Text size="sm" fw={500} mb={5}>Selected Database</Text>
                  {selectedDatabase ? (
                    <Paper withBorder p="sm">
                      <Group justify="space-between">
                        <Text size="sm">{selectedDatabase.title}</Text>
                        <Button 
                          size="xs" 
                          variant="light"
                          onClick={() => testConnection.mutate({ integrationId: notionIntegration!.id })}
                        >
                          Change Database
                        </Button>
                      </Group>
                    </Paper>
                  ) : (
                    <Button 
                      variant="outline" 
                      fullWidth
                      onClick={() => testConnection.mutate({ integrationId: notionIntegration!.id })}
                      loading={testConnection.isPending}
                    >
                      Select Database
                    </Button>
                  )}
                </div>
              </Group>

              {selectedDatabase && (
                <>
                  <Text fw={500} size="sm">Property Mappings (Optional)</Text>
                  <Text size="xs" c="dimmed" mb="xs">
                    Map your action fields to Notion database properties:
                  </Text>
                  
                  {/* Debug: Show all available properties */}
                  <Paper withBorder p="xs" mb="sm">
                    <Text size="xs" fw={500} mb={4}>Available properties on &ldquo;{selectedDatabase.title}&rdquo;:</Text>
                    <Group gap="xs">
                      {selectedDatabase.properties && Object.entries(selectedDatabase.properties).map(([key, prop]) => (
                        <Badge key={key} size="xs" variant="outline">
                          {prop.name} ({prop.type})
                        </Badge>
                      ))}
                      {!selectedDatabase.properties && (
                        <Text size="xs" c="dimmed">No properties available</Text>
                      )}
                    </Group>
                  </Paper>
                  
                  <Select
                    label="Title Property"
                    placeholder="Select title property"
                    description="Choose which property will hold the task name"
                    data={getPropertyOptions('title')}
                    {...workflowForm.getInputProps('propertyMappings.title')}
                    clearable
                    mb="md"
                  />
                  
                  <Group grow>
                    <Select
                      label="Assignee Property"
                      placeholder="Select person property"
                      data={getPropertyOptions('person')}
                      {...workflowForm.getInputProps('propertyMappings.assignee')}
                      clearable
                    />
                    <Select
                      label="Due Date Property"
                      placeholder="Select date property"
                      data={getPropertyOptions('date')}
                      {...workflowForm.getInputProps('propertyMappings.dueDate')}
                      clearable
                    />
                  </Group>

                  <Group grow>
                    <Select
                      label="Priority Property"
                      placeholder="Select select property"
                      data={getPropertyOptions('select')}
                      {...workflowForm.getInputProps('propertyMappings.priority')}
                      clearable
                    />
                    <Select
                      label="Description Property"
                      placeholder="Select text property"
                      data={getPropertyOptions('rich_text')}
                      {...workflowForm.getInputProps('propertyMappings.description')}
                      clearable
                    />
                  </Group>
                </>
              )}

              <Select
                label="Action Source"
                description="Choose which actions to sync to Notion"
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
                    { value: 'push', label: 'Push to Notion' },
                    { value: 'pull', label: 'Pull from Notion' },
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
                  disabled={!selectedDatabase}
                >
                  Create Workflow
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>

        {/* Databases Modal */}
        <Modal
          opened={databasesModalOpened}
          onClose={closeDatabasesModal}
          title="Accessible Notion Databases"
          size="lg"
        >
          <Stack gap="md">
            {databases.length === 0 ? (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="No Databases Found"
                color="orange"
              >
                No databases are currently shared with your integration. Please share at least one database with your integration in Notion.
              </Alert>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  Found {databases.length} database{databases.length !== 1 ? 's' : ''} accessible to your integration:
                </Text>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Database Name</Table.Th>
                      <Table.Th>Properties</Table.Th>
                      <Table.Th>Action</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {databases.map((db) => (
                      <Table.Tr key={db.id}>
                        <Table.Td>
                          <div>
                            <Text fw={500}>{db.title || 'Untitled Database'}</Text>
                            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                              {db.id}
                            </Text>
                          </div>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            {db.properties && Object.entries(db.properties).slice(0, 3).map(([key, prop]) => (
                              <Badge key={key} size="xs" variant="outline">
                                {prop.name} ({prop.type})
                              </Badge>
                            ))}
                            {db.properties && Object.keys(db.properties).length > 3 && (
                              <Badge size="xs" variant="outline" color="gray">
                                +{Object.keys(db.properties).length - 3} more
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Button 
                            size="xs" 
                            onClick={() => handleSelectDatabase(db)}
                          >
                            Select
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                <Alert
                  icon={<IconBrandNotion size={16} />}
                  title="How to use Database IDs"
                  color="blue"
                  variant="light"
                >
                  Copy the Database ID and use it when configuring your workflow sync settings.
                </Alert>
              </>
            )}
            <Group justify="flex-end">
              <Button variant="light" onClick={closeDatabasesModal}>
                Close
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Existing Workflows */}
        {notionWorkflows.length > 0 && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" align="center" mb="md">
              <Title order={4}>Active Notion Workflows</Title>
              <Badge variant="light" color="blue">
                {notionWorkflows.length} workflow{notionWorkflows.length !== 1 ? 's' : ''}
              </Badge>
            </Group>
            
            <Stack gap="md">
              {notionWorkflows.map((workflow) => (
                <Paper key={workflow.id} p="md" radius="sm" withBorder>
                  <Group justify="space-between" align="flex-start">
                    <div style={{ flex: 1 }}>
                      <Group gap="sm" mb="xs">
                        <Text fw={500}>{workflow.name}</Text>
                        <Badge 
                          size="sm" 
                          color={workflow.status === 'ACTIVE' ? 'green' : workflow.status === 'ERROR' ? 'red' : 'gray'}
                          variant="light"
                        >
                          {workflow.status}
                        </Badge>
                        <Badge size="sm" variant="outline">
                          {workflow.syncDirection}
                        </Badge>
                        <Badge size="sm" variant="outline">
                          {workflow.syncFrequency}
                        </Badge>
                      </Group>
                      
                      {workflow.runs && workflow.runs.length > 0 && (
                        <Text size="sm" c="dimmed">
                          Last run: {new Date(workflow.runs[0]!.startedAt).toLocaleString()} • 
                          {workflow.runs[0]!.status === 'SUCCESS' ? (
                            <span style={{ color: 'var(--mantine-color-green-6)' }}>
                              {workflow.runs[0]!.itemsCreated} created, {workflow.runs[0]!.itemsUpdated || 0} updated
                            </span>
                          ) : (
                            <span style={{ color: 'var(--mantine-color-red-6)' }}>
                              {workflow.runs[0]!.status}
                            </span>
                          )}
                        </Text>
                      )}
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
          </Card>
        )}

        {/* Edit Workflow Modal */}
        <Modal 
          opened={editWorkflowModalOpened} 
          onClose={closeEditWorkflowModal}
          title="Edit Notion Workflow"
          size="xl"
          styles={{
            body: { maxHeight: '80vh', overflowY: 'auto' },
            content: { maxHeight: '90vh' }
          }}
        >
          <form onSubmit={editWorkflowForm.onSubmit(handleUpdateWorkflow)}>
            <Stack gap="md">
              <TextInput
                label="Workflow Name"
                placeholder="e.g., Actions → Notion Sync"
                required
                {...editWorkflowForm.getInputProps('name')}
              />

              <Group grow>
                <div>
                  <Text size="sm" fw={500} mb={5}>Current Database</Text>
                  {editWorkflowForm.values.databaseId ? (
                    <Paper withBorder p="sm">
                      <Group justify="space-between">
                        <div>
                          {selectedDatabase ? (
                            <>
                              <Text size="sm" fw={500}>{selectedDatabase.title}</Text>
                              <Text size="xs" c="dimmed">Database ID: {editWorkflowForm.values.databaseId}</Text>
                            </>
                          ) : (
                            <Text size="sm">Database ID: {editWorkflowForm.values.databaseId}</Text>
                          )}
                        </div>
                        <Button 
                          size="xs" 
                          variant="light"
                          onClick={() => testConnection.mutate({ integrationId: notionIntegration!.id })}
                        >
                          Change Database
                        </Button>
                      </Group>
                    </Paper>
                  ) : (
                    <Button 
                      variant="outline" 
                      fullWidth
                      onClick={() => testConnection.mutate({ integrationId: notionIntegration!.id })}
                      loading={testConnection.isPending}
                    >
                      Select Database
                    </Button>
                  )}
                </div>
              </Group>

              {selectedDatabase && (
                <>
                  <Text fw={500} size="sm">Property Mappings (Optional)</Text>
                  <Text size="xs" c="dimmed" mb="xs">
                    Map your action fields to Notion database properties:
                  </Text>
                  
                  {/* Debug: Show all available properties */}
                  <Paper withBorder p="xs" mb="sm">
                    <Text size="xs" fw={500} mb={4}>Available properties on &ldquo;{selectedDatabase.title}&rdquo;:</Text>
                    <Group gap="xs">
                      {selectedDatabase.properties && Object.entries(selectedDatabase.properties).map(([key, prop]) => (
                        <Badge key={key} size="xs" variant="outline">
                          {prop.name} ({prop.type})
                        </Badge>
                      ))}
                      {!selectedDatabase.properties && (
                        <Text size="xs" c="dimmed">No properties available</Text>
                      )}
                    </Group>
                  </Paper>
                  
                  <Select
                    label="Title Property"
                    placeholder="Select title property"
                    description="Choose which property will hold the task name"
                    data={getPropertyOptions('title')}
                    {...editWorkflowForm.getInputProps('propertyMappings.title')}
                    clearable
                    mb="md"
                  />
                  
                  <Group grow>
                    <Select
                      label="Assignee Property"
                      placeholder="Select person property"
                      data={getPropertyOptions('person')}
                      {...editWorkflowForm.getInputProps('propertyMappings.assignee')}
                      clearable
                    />
                    <Select
                      label="Due Date Property"
                      placeholder="Select date property"
                      data={getPropertyOptions('date')}
                      {...editWorkflowForm.getInputProps('propertyMappings.dueDate')}
                      clearable
                    />
                  </Group>

                  <Group grow>
                    <Select
                      label="Priority Property"
                      placeholder="Select select property"
                      data={getPropertyOptions('select')}
                      {...editWorkflowForm.getInputProps('propertyMappings.priority')}
                      clearable
                    />
                    <Select
                      label="Description Property"
                      placeholder="Select text property"
                      data={getPropertyOptions('rich_text')}
                      {...editWorkflowForm.getInputProps('propertyMappings.description')}
                      clearable
                    />
                  </Group>
                </>
              )}

              <Select
                label="Action Source"
                description="Choose which actions to sync to Notion"
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
                    { value: 'push', label: 'Push to Notion' },
                    { value: 'pull', label: 'Pull from Notion' },
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

        {/* Back to Workflows */}
        <Group justify="center">
          <Button
            component={Link}
            href="/workflows"
            variant="light"
            leftSection={<IconArrowRight size={16} style={{ transform: 'rotate(180deg)' }} />}
          >
            Back to All Workflows
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}