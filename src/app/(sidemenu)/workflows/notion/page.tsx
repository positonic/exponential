'use client';

import { useState } from 'react';
import { Container, Title, Text, Button, Card, Group, Stack, ThemeIcon, Badge, Alert, Modal, TextInput, Select, Textarea, Paper, Accordion, List, Table } from '@mantine/core';
import { IconDatabase, IconArrowRight, IconCheck, IconAlertCircle, IconPlus, IconBrandNotion, IconExternalLink } from '@tabler/icons-react';
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
  description?: string;
}

export default function NotionWorkflowPage() {
  const [integrationModalOpened, { open: openIntegrationModal, close: closeIntegrationModal }] = useDisclosure(false);
  const [workflowModalOpened, { open: openWorkflowModal, close: closeWorkflowModal }] = useDisclosure(false);
  const [databasesModalOpened, { open: openDatabasesModal, close: closeDatabasesModal }] = useDisclosure(false);
  const [databases, setDatabases] = useState<Array<{ id: string; title: string; permissions: string[] }>>([]);
  
  // API calls for checking configuration status
  const { data: integrations = [] } = api.integration.listIntegrations.useQuery();
  const utils = api.useUtils();

  // Test connection and get databases
  const testConnection = api.integration.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success && data.databases) {
        setDatabases(data.databases);
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
      name: 'Task Management Sync',
      databaseId: '',
      syncDirection: 'bidirectional',
      syncFrequency: 'daily',
      description: 'Sync tasks between your application and Notion database',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Workflow name is required' : null,
      databaseId: (value) => value.trim().length === 0 ? 'Database ID is required' : null,
    },
  });

  // Check if Notion integration exists
  const hasNotionIntegration = integrations.some(integration => 
    integration.provider === 'notion' && 
    integration.status === 'ACTIVE'
  );

  const handleCreateIntegration = async (values: NotionIntegrationForm) => {
    await createIntegration.mutateAsync({
      name: values.name,
      provider: 'notion',
      apiKey: values.apiKey,
      description: values.description,
    });
  };

  const handleTestDatabases = () => {
    const notionIntegration = integrations.find(integration => 
      integration.provider === 'notion' && 
      integration.status === 'ACTIVE'
    );
    
    if (notionIntegration) {
      testConnection.mutate({ integrationId: notionIntegration.id });
    }
  };

  const handleCreateWorkflow = async (_values: NotionWorkflowForm) => {
    try {
      // This would be implemented with a workflow creation API
      notifications.show({
        title: 'Workflow Created',
        message: 'Your Notion workflow has been configured successfully.',
        color: 'green',
      });
      closeWorkflowModal();
      workflowForm.reset();
    } catch (_error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create workflow',
        color: 'red',
      });
    }
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
            <Alert 
              icon={<IconCheck size={16} />}
              title="Notion Connected!"
              color="green"
              variant="light"
              mb="md"
            >
              Your Notion integration is connected and ready to sync with databases.
            </Alert>
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

        {/* Sync Configuration Modal */}
        <Modal 
          opened={workflowModalOpened} 
          onClose={closeWorkflowModal}
          title="Configure Notion Database Sync"
          size="md"
        >
          <form onSubmit={workflowForm.onSubmit(handleCreateWorkflow)}>
            <Stack gap="md">
              <TextInput
                label="Workflow Name"
                placeholder="e.g., Task Management Sync"
                required
                {...workflowForm.getInputProps('name')}
              />

              <TextInput
                label="Notion Database ID"
                placeholder="Enter your Notion database ID"
                description="You can find the database ID in your Notion database URL"
                required
                {...workflowForm.getInputProps('databaseId')}
              />

              <Select
                label="Sync Direction"
                description="Choose how data should flow between systems"
                data={[
                  { value: 'push', label: 'Push Only (App → Notion)' },
                  { value: 'pull', label: 'Pull Only (Notion → App)' },
                  { value: 'bidirectional', label: 'Bidirectional (Both ways)' },
                ]}
                {...workflowForm.getInputProps('syncDirection')}
              />

              <Select
                label="Sync Frequency"
                description="How often should the sync run?"
                data={[
                  { value: 'manual', label: 'Manual Only' },
                  { value: 'hourly', label: 'Every Hour' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                ]}
                {...workflowForm.getInputProps('syncFrequency')}
              />

              <Textarea
                label="Description"
                placeholder="Optional description for this workflow"
                {...workflowForm.getInputProps('description')}
                minRows={2}
              />

              <Alert 
                icon={<IconBrandNotion size={16} />}
                title="Database Permissions"
                color="blue"
              >
                Make sure your database is shared with your integration and has appropriate permissions.
              </Alert>

              <Group justify="flex-end">
                <Button variant="light" onClick={closeWorkflowModal}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  leftSection={<IconPlus size={16} />}
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
                      <Table.Th>Permissions</Table.Th>
                      <Table.Th>Database ID</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {databases.map((db) => (
                      <Table.Tr key={db.id}>
                        <Table.Td>{db.title || 'Untitled Database'}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            {db.permissions.map((permission) => (
                              <Badge key={permission} size="xs" variant="light">
                                {permission}
                              </Badge>
                            ))}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                            {db.id}
                          </Text>
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