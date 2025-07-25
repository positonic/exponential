'use client';

import { useState } from 'react';
import { 
  Container, 
  Title, 
  Text, 
  Button, 
  Table, 
  Badge, 
  Group,
  Stack,
  Paper,
  ActionIcon,
  Tooltip,
  Modal,
  TextInput,
  Select,
  Textarea,
  Alert,
  LoadingOverlay
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { 
  IconPlus, 
  IconPlugConnected, 
  IconTrash, 
  IconCheck, 
  IconAlertCircle,
  IconTestPipe,
  IconBrandFirebase,
  IconBrandSlack
} from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

interface CreateIntegrationForm {
  name: string;
  provider: string;
  apiKey: string;
  description?: string;
  // Slack-specific fields
  botToken?: string;
  signingSecret?: string;
  teamId?: string;
  teamName?: string;
}

const PROVIDER_OPTIONS = [
  { value: 'fireflies', label: 'Fireflies.ai', icon: IconBrandFirebase, disabled: false },
  { value: 'exponential-plugin', label: 'Exponential Plugin', disabled: false },
  { value: 'github', label: 'GitHub', disabled: true },
  { value: 'slack', label: 'Slack', icon: IconBrandSlack, disabled: false },
  { value: 'notion', label: 'Notion', disabled: true },
];

export default function IntegrationsClient() {
  const [opened, { open, close }] = useDisclosure(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Handle success/error messages from URL parameters (e.g., from Slack OAuth callback)
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    
    if (success) {
      notifications.show({
        title: 'Integration Connected',
        message: decodeURIComponent(success),
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    }
    
    if (error) {
      notifications.show({
        title: 'Integration Error',
        message: decodeURIComponent(error),
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    }
  }, [searchParams]);

  // API calls
  const { data: integrations = [], isLoading, refetch } = api.integration.listIntegrations.useQuery();
  
  const createIntegration = api.integration.createIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Integration Created',
        message: 'Your integration has been created successfully and connection tested.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
      form.reset();
      close();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create integration',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const createSlackIntegration = api.integration.createSlackIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Slack Integration Created',
        message: 'Your Slack integration has been created successfully and connection tested.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
      form.reset();
      close();
    },
    onError: (error) => {
      notifications.show({
        title: 'Slack Integration Error',
        message: error.message || 'Failed to create Slack integration',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const deleteIntegration = api.integration.deleteIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Integration Deleted',
        message: 'The integration has been deleted successfully.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete integration',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const testConnection = api.integration.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: 'Connection Successful',
          message: `Successfully connected to ${data.provider}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
      } else {
        notifications.show({
          title: 'Connection Failed',
          message: data.error || 'Connection test failed',
          color: 'red',
          icon: <IconAlertCircle size={16} />,
        });
      }
      setTestingConnection(null);
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to test connection',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
      setTestingConnection(null);
    },
  });

  const form = useForm<CreateIntegrationForm>({
    initialValues: {
      name: '',
      provider: 'fireflies',
      apiKey: '',
      description: '',
      botToken: '',
      signingSecret: '',
      teamId: '',
      teamName: '',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Integration name is required' : null,
      provider: (value) => value.trim().length === 0 ? 'Provider is required' : null,
      apiKey: (value, values) => {
        // Don't require API key for Slack (uses manual credentials)
        if (values.provider === 'slack') return null;
        return value.trim().length === 0 ? 'API key is required' : null;
      },
      botToken: (value, values) => {
        if (values.provider === 'slack' && (!value || value.trim().length === 0)) {
          return 'Bot token is required for Slack integration';
        }
        return null;
      },
      signingSecret: (value, values) => {
        if (values.provider === 'slack' && (!value || value.trim().length === 0)) {
          return 'Signing secret is required for Slack integration';
        }
        return null;
      },
      // Team ID and Team Name are now optional - will be fetched from bot token
    },
  });

  const handleCreateIntegration = async (values: CreateIntegrationForm) => {
    // Special handling for Slack - use createSlackIntegration with manual credentials
    if (values.provider === 'slack') {
      await createSlackIntegration.mutateAsync({
        name: values.name,
        description: values.description,
        botToken: values.botToken!,
        signingSecret: values.signingSecret!,
        teamId: values.teamId || undefined,
        teamName: values.teamName || undefined,
      });
      return;
    }

    await createIntegration.mutateAsync({
      name: values.name,
      provider: values.provider as 'fireflies' | 'github' | 'slack' | 'notion' | 'webhook',
      apiKey: values.apiKey,
      description: values.description,
    });
  };

  const handleTestConnection = async (integrationId: string) => {
    setTestingConnection(integrationId);
    await testConnection.mutateAsync({ integrationId });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'fireflies':
        return <IconBrandFirebase size={16} />;
      case 'slack':
        return <IconBrandSlack size={16} />;
      default:
        return <IconPlugConnected size={16} />;
    }
  };

  const getProviderLabel = (provider: string) => {
    const option = PROVIDER_OPTIONS.find(p => p.value === provider);
    return option?.label || provider;
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={1} size="h2">External Service Integrations</Title>
            <Text c="dimmed" size="sm">
              Connect Exponential TO external services (Fireflies, GitHub, etc.) using their API keys
            </Text>
            <Text c="blue" size="sm" mt="xs">
              💡 Need to give external apps access to YOUR Exponential data? <Link href="/tokens" style={{ textDecoration: 'underline' }}>Generate API tokens here</Link>
            </Text>
          </div>
          <Button 
            leftSection={<IconPlus size={16} />}
            onClick={open}
          >
            Add Integration
          </Button>
        </Group>

        {/* Integrations Table */}
        <Paper withBorder p="md">
          <LoadingOverlay visible={isLoading} />
          {!isLoading && integrations && integrations.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Provider</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {integrations.map((integration) => (
                  <Table.Tr key={integration.id}>
                    <Table.Td>
                      <Group gap="xs">
                        {getProviderIcon(integration.provider)}
                        <div>
                          <Text fw={500}>{integration.name}</Text>
                          {integration.description && (
                            <Text size="xs" c="dimmed">
                              {integration.description}
                            </Text>
                          )}
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{getProviderLabel(integration.provider)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge 
                        color={integration.status === 'ACTIVE' ? 'green' : 'red'}
                        variant="light"
                      >
                        {integration.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(integration.createdAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Test connection">
                          <ActionIcon 
                            color="blue" 
                            variant="light"
                            size="sm"
                            loading={testingConnection === integration.id}
                            onClick={() => handleTestConnection(integration.id)}
                          >
                            <IconTestPipe size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete integration">
                          <ActionIcon 
                            color="red" 
                            variant="light"
                            size="sm"
                            loading={deleteIntegration.isPending}
                            onClick={() => deleteIntegration.mutate({ integrationId: integration.id })}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : !isLoading ? (
            <Stack align="center" py="xl">
              <IconPlugConnected size={48} color="gray" />
              <Text size="lg" fw={500}>No integrations found</Text>
              <Text c="dimmed" ta="center">
                Connect your first external service to start automating your workflow
              </Text>
            </Stack>
          ) : null}
        </Paper>

        {/* Create Integration Modal */}
        <Modal 
          opened={opened} 
          onClose={close}
          title="Add Integration"
          size="md"
        >
          <form onSubmit={form.onSubmit(handleCreateIntegration)}>
            <Stack gap="md">
              <TextInput
                label="Integration Name"
                placeholder="e.g., My Fireflies Account"
                required
                {...form.getInputProps('name')}
              />

              <Select
                label="Provider"
                data={PROVIDER_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                  disabled: option.disabled
                }))}
                required
                {...form.getInputProps('provider')}
              />

              {form.values.provider !== 'slack' && (
                <TextInput
                  label="API Key"
                  placeholder="Enter your API key"
                  required
                  type="password"
                  {...form.getInputProps('apiKey')}
                />
              )}

              {form.values.provider === 'slack' && (
                <>
                  <Alert 
                    icon={<IconBrandSlack size={16} />}
                    title="Slack App Setup Required"
                    color="blue"
                  >
                    You need to create a Slack app for your workspace first. Visit{' '}
                    <Text component="a" href="https://api.slack.com/apps" target="_blank" style={{ textDecoration: 'underline' }}>
                      api.slack.com/apps
                    </Text>{' '}
                    to create an app and get the required credentials below.
                  </Alert>

                  <TextInput
                    label="Bot Token"
                    placeholder="xoxb-your-bot-token"
                    required
                    type="password"
                    {...form.getInputProps('botToken')}
                    description="Found in OAuth & Permissions > Bot User OAuth Token"
                  />

                  <TextInput
                    label="Signing Secret"
                    placeholder="your-signing-secret"
                    required
                    type="password"
                    {...form.getInputProps('signingSecret')}
                    description="Found in Basic Information > Signing Secret"
                  />

                  <TextInput
                    label="Team ID (Optional)"
                    placeholder="T1234567890"
                    {...form.getInputProps('teamId')}
                    description="Will be auto-detected from bot token if not provided"
                  />

                  <TextInput
                    label="Team Name (Optional)"
                    placeholder="Your Workspace Name"
                    {...form.getInputProps('teamName')}
                    description="Will be auto-detected from bot token if not provided"
                  />
                </>
              )}

              <Textarea
                label="Description (Optional)"
                placeholder="What will this integration be used for?"
                {...form.getInputProps('description')}
                minRows={2}
              />

              {form.values.provider === 'fireflies' && (
                <Alert 
                  icon={<IconAlertCircle size={16} />}
                  title="Fireflies Setup"
                  color="blue"
                >
                  Your Fireflies API key will be tested during creation. Make sure to configure webhooks in your Fireflies account to point to this application.
                </Alert>
              )}

              <Group justify="flex-end">
                <Button variant="light" onClick={close}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  loading={createIntegration.isPending || createSlackIntegration.isPending}
                >
                  Create Integration
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>
      </Stack>
    </Container>
  );
}