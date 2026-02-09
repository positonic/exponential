'use client';

import { useState, useEffect } from 'react';
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
  LoadingOverlay,
  Checkbox
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
  IconBrandSlack,
  IconRefresh,
  IconEdit,
  IconShare,
  IconSettings
} from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { IntegrationPermissionManager } from '~/app/_components/IntegrationPermissionManager';
import { ConnectedServicesGrid } from '~/app/_components/ConnectedServicesGrid';
import { AvailableServicesGrid } from '~/app/_components/AvailableServicesGrid';

interface CreateIntegrationForm {
  name: string;
  provider: string;
  apiKey: string;
  description?: string;
  allowTeamMemberAccess?: boolean;
  // Slack-specific fields
  botToken?: string;
  signingSecret?: string;
  teamId?: string;
  teamName?: string;
  appId?: string;
  // WhatsApp-specific fields
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappWebhookVerifyToken?: string;
  // Email-specific fields
  emailAddress?: string;
  emailAppPassword?: string;
  emailProvider?: 'gmail' | 'outlook' | 'custom';
  emailImapHost?: string;
  emailSmtpHost?: string;
}

interface EditIntegrationForm {
  name: string;
  description?: string;
  allowTeamMemberAccess?: boolean;
  // Slack-specific fields for editing
  appId?: string;
}

const PROVIDER_OPTIONS = [
  { 
    value: 'fireflies', 
    label: 'Fireflies.ai', 
    description: 'Automatically capture and transcribe meeting notes from video calls',
    icon: IconBrandFirebase, 
    disabled: false, 
    oauth: false 
  },
  { 
    value: 'exponential-plugin', 
    label: 'Exponential Plugin', 
    description: 'Browser extension for seamless task creation from web content',
    disabled: false, 
    oauth: false 
  },
  { 
    value: 'github', 
    label: 'GitHub', 
    description: 'Sync issues, pull requests, and repository activity with your projects',
    disabled: false, 
    oauth: true 
  },
  { 
    value: 'slack', 
    label: 'Slack', 
    description: 'Send notifications and manage tasks directly from your Slack workspace',
    icon: IconBrandSlack, 
    disabled: false, 
    oauth: true 
  },
  { 
    value: 'whatsapp', 
    label: 'WhatsApp', 
    description: 'Receive task updates and manage workflow through WhatsApp Business',
    disabled: false, 
    oauth: false 
  },
  { 
    value: 'notion', 
    label: 'Notion', 
    description: 'Sync pages, databases, and collaborate on project documentation',
    disabled: false, 
    oauth: true 
  },
  {
    value: 'monday',
    label: 'Monday.com',
    description: 'Sync boards, items, and project status with Monday.com workspace',
    disabled: false,
    oauth: false
  },
  {
    value: 'email',
    label: 'Email (IMAP)',
    description: 'Connect your email so Zoe can read and send on your behalf',
    disabled: false,
    oauth: false
  },
];

export default function IntegrationsClient() {
  const [opened, { open, close }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [permissionsModalOpened, { open: openPermissionsModal, close: closePermissionsModal }] = useDisclosure(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [refreshingIntegration, setRefreshingIntegration] = useState<string | null>(null);
  const [editingIntegration, setEditingIntegration] = useState<any>(null);
  const [permissionsIntegration, setPermissionsIntegration] = useState<any>(null);
  const [selectedServiceProvider, setSelectedServiceProvider] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'details'>('grid');
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

  const createWhatsAppIntegration = api.integration.createWhatsAppIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'WhatsApp Integration Created',
        message: 'Your WhatsApp integration has been created successfully.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
      form.reset();
      close();
    },
    onError: (error) => {
      notifications.show({
        title: 'WhatsApp Integration Error',
        message: error.message || 'Failed to create WhatsApp integration',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const createEmailIntegration = api.integration.createEmailIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Email Connected',
        message: 'Your email has been connected successfully. Zoe can now read and send emails on your behalf.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
      form.reset();
      close();
    },
    onError: (error) => {
      notifications.show({
        title: 'Email Connection Failed',
        message: error.message || 'Failed to connect email. Please check your credentials.',
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

  const refreshSlackIntegration = api.integration.refreshSlackIntegration.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Integration Refreshed',
        message: data.message,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch(); // Refresh the integrations list
      setRefreshingIntegration(null);
    },
    onError: (error) => {
      notifications.show({
        title: 'Refresh Failed',
        message: error.message || 'Failed to refresh Slack integration',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
      setRefreshingIntegration(null);
    },
  });

  const updateIntegration = api.integration.updateIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Integration Updated',
        message: 'Your integration has been updated successfully.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
      closeEditModal();
      setEditingIntegration(null);
    },
    onError: (error) => {
      notifications.show({
        title: 'Update Failed',
        message: error.message || 'Failed to update integration',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  // Query for integration details when editing
  const { data: integrationDetails } = api.integration.getIntegrationDetails.useQuery(
    { integrationId: editingIntegration?.id || '' },
    { enabled: !!editingIntegration?.id }
  );

  const form = useForm<CreateIntegrationForm>({
    initialValues: {
      name: '',
      provider: 'fireflies',
      apiKey: '',
      description: '',
      allowTeamMemberAccess: false,
      botToken: '',
      signingSecret: '',
      teamId: '',
      teamName: '',
      appId: '',
      whatsappAccessToken: '',
      whatsappPhoneNumberId: '',
      whatsappBusinessAccountId: '',
      whatsappWebhookVerifyToken: '',
      emailAddress: '',
      emailAppPassword: '',
      emailProvider: 'gmail' as 'gmail' | 'outlook' | 'custom',
      emailImapHost: '',
      emailSmtpHost: '',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Integration name is required' : null,
      provider: (value) => value.trim().length === 0 ? 'Provider is required' : null,
      apiKey: (value, values) => {
        // Don't require API key for Slack, WhatsApp, or Email (uses manual credentials)
        if (values.provider === 'slack' || values.provider === 'whatsapp' || values.provider === 'email') return null;
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
      appId: (value, values) => {
        if (values.provider === 'slack' && (!value || value.trim().length === 0)) {
          return 'App ID is required for Slack integration';
        }
        return null;
      },
      // Team ID and Team Name are now optional - will be fetched from bot token
      // WhatsApp-specific validations
      whatsappAccessToken: (value, values) => {
        if (values.provider === 'whatsapp' && (!value || value.trim().length === 0)) {
          return 'Access Token is required for WhatsApp integration';
        }
        return null;
      },
      whatsappPhoneNumberId: (value, values) => {
        if (values.provider === 'whatsapp' && (!value || value.trim().length === 0)) {
          return 'Phone Number ID is required for WhatsApp integration';
        }
        return null;
      },
      whatsappBusinessAccountId: (value, values) => {
        if (values.provider === 'whatsapp' && (!value || value.trim().length === 0)) {
          return 'Business Account ID is required for WhatsApp integration';
        }
        return null;
      },
      whatsappWebhookVerifyToken: (value, values) => {
        if (values.provider === 'whatsapp' && (!value || value.trim().length === 0)) {
          return 'Webhook Verify Token is required for WhatsApp integration';
        }
        return null;
      },
      // Email-specific validations
      emailAddress: (value, values) => {
        if (values.provider === 'email' && (!value || value.trim().length === 0)) {
          return 'Email address is required';
        }
        if (values.provider === 'email' && value && !value.includes('@')) {
          return 'Please enter a valid email address';
        }
        return null;
      },
      emailAppPassword: (value, values) => {
        if (values.provider === 'email' && (!value || value.trim().length === 0)) {
          return 'App password is required';
        }
        return null;
      },
    },
  });

  const editForm = useForm<EditIntegrationForm>({
    initialValues: {
      name: '',
      description: '',
      allowTeamMemberAccess: false,
      appId: '',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'Integration name is required' : null,
      appId: (value, _values) => {
        // For Slack integrations, APP_ID should be required
        if (integrationDetails?.provider === 'slack' && (!value || value.trim().length === 0)) {
          return 'App ID is required for Slack integrations';
        }
        return null;
      },
    },
  });

  // Update edit form when integration details load
  useEffect(() => {
    if (integrationDetails) {
      editForm.setValues({
        name: integrationDetails.name,
        description: integrationDetails.description || '',
        allowTeamMemberAccess: integrationDetails.allowTeamMemberAccess || false,
        appId: integrationDetails.appId || '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationDetails]); // editForm is stable from useForm hook

  const handleCreateIntegration = async (values: CreateIntegrationForm) => {
    // Special handling for Slack - use createSlackIntegration with manual credentials
    if (values.provider === 'slack') {
      await createSlackIntegration.mutateAsync({
        name: values.name,
        description: values.description,
        botToken: values.botToken!,
        signingSecret: values.signingSecret!,
        slackTeamId: values.teamId || undefined,
        teamName: values.teamName || undefined,
        appId: values.appId || undefined,
        allowTeamMemberAccess: values.allowTeamMemberAccess || false,
      });
      return;
    }

    // Special handling for Email - use createEmailIntegration
    if (values.provider === 'email') {
      await createEmailIntegration.mutateAsync({
        name: values.name,
        emailAddress: values.emailAddress!,
        appPassword: values.emailAppPassword!,
        emailProvider: values.emailProvider || 'gmail',
        imapHost: values.emailImapHost || undefined,
        smtpHost: values.emailSmtpHost || undefined,
        description: values.description,
        allowTeamMemberAccess: values.allowTeamMemberAccess || false,
      });
      return;
    }

    // Special handling for WhatsApp - use createWhatsAppIntegration with manual credentials
    if (values.provider === 'whatsapp') {
      await createWhatsAppIntegration.mutateAsync({
        name: values.name,
        phoneNumberId: values.whatsappPhoneNumberId!,
        businessAccountId: values.whatsappBusinessAccountId!,
        accessToken: values.whatsappAccessToken!,
        webhookVerifyToken: values.whatsappWebhookVerifyToken!,
        description: values.description,
        allowTeamMemberAccess: values.allowTeamMemberAccess || false,
      });
      return;
    }

    await createIntegration.mutateAsync({
      name: values.name,
      provider: values.provider as 'fireflies' | 'github' | 'slack' | 'notion' | 'webhook',
      apiKey: values.apiKey,
      description: values.description,
      allowTeamMemberAccess: values.allowTeamMemberAccess || false,
    });
  };

  const handleEditIntegration = async (values: EditIntegrationForm) => {
    if (!editingIntegration) return;
    
    await updateIntegration.mutateAsync({
      integrationId: editingIntegration.id,
      name: values.name,
      description: values.description,
      appId: values.appId,
      allowTeamMemberAccess: values.allowTeamMemberAccess,
    });
  };

  const openEditModalForIntegration = (integration: any) => {
    setEditingIntegration(integration);
    openEditModal();
  };

  const openPermissionsModalForIntegration = (integration: any) => {
    setPermissionsIntegration(integration);
    openPermissionsModal();
  };

  const handleTestConnection = async (integrationId: string) => {
    setTestingConnection(integrationId);
    await testConnection.mutateAsync({ integrationId });
  };

  const handleRefreshSlackIntegration = async (integrationId: string) => {
    setRefreshingIntegration(integrationId);
    await refreshSlackIntegration.mutateAsync({ integrationId });
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

  const isOAuthProvider = (provider: string) => {
    const option = PROVIDER_OPTIONS.find(p => p.value === provider);
    return option?.oauth || false;
  };

  const handleOAuthConnect = (provider: string) => {
    switch (provider) {
      case 'github':
        window.location.href = '/api/auth/github/authorize';
        break;
      case 'notion':
        window.location.href = '/api/auth/notion/authorize';
        break;
      case 'slack':
        window.location.href = '/api/auth/slack/authorize';
        break;
      default:
        notifications.show({
          title: 'Not Supported',
          message: `OAuth not supported for ${provider}`,
          color: 'red',
        });
    }
  };

  // Handler for clicking on a connected service card
  const handleConnectedServiceClick = (integration: any) => {
    setSelectedServiceProvider(integration.provider);
    setViewMode('details');
  };

  // Handler for clicking on a provider (grouped services)
  const handleProviderClick = (provider: string) => {
    setSelectedServiceProvider(provider);
    setViewMode('details');
  };

  // Handler for clicking on an available service card
  const handleAvailableServiceClick = (provider: string) => {
    // Pre-select the provider and open the add integration modal
    form.setFieldValue('provider', provider);
    open();
  };

  // Handler for going back to grid view
  const handleBackToGrid = () => {
    setViewMode('grid');
    setSelectedServiceProvider(null);
  };

  // Filter integrations for details view
  const filteredIntegrations = selectedServiceProvider 
    ? integrations.filter(integration => integration.provider === selectedServiceProvider)
    : integrations;

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="center">
          <div>
            <Title order={1} size="h2">External Service Integrations</Title>
            <Text c="dimmed" size="sm">
              Connect Exponential to external services (Fireflies, GitHub, etc.) using their API keys
            </Text>
            <Text c="blue" size="sm" mt="xs">
              💡 Need to give external apps access to YOUR Exponential data? <Link href="/settings/api-keys" style={{ textDecoration: 'underline' }}>Generate API tokens here</Link>
            </Text>
          </div>
          {viewMode === 'grid' && (
            <Button 
              leftSection={<IconPlus size={16} />}
              onClick={open}
            >
              Add Integration
            </Button>
          )}
          {viewMode === 'details' && (
            <Group gap="sm">
              <Button 
                variant="light"
                onClick={handleBackToGrid}
              >
                ← Back to Services
              </Button>
              <Button 
                leftSection={<IconPlus size={16} />}
                onClick={open}
              >
                Add Integration
              </Button>
            </Group>
          )}
        </Group>

        <LoadingOverlay visible={isLoading} />
        
        {/* Grid View */}
        {viewMode === 'grid' && !isLoading && (
          <>
            {/* Connected Services Grid */}
            <ConnectedServicesGrid
              integrations={integrations}
              onServiceClick={handleConnectedServiceClick}
              onProviderClick={handleProviderClick}
              onTestConnection={handleTestConnection}
              onRefresh={handleRefreshSlackIntegration}
              onSettings={openEditModalForIntegration}
              loadingStates={{
                testing: testingConnection,
                refreshing: refreshingIntegration
              }}
            />

            {/* Available Services Grid */}
            <AvailableServicesGrid
              providerOptions={PROVIDER_OPTIONS}
              connectedIntegrations={integrations}
              onServiceClick={handleAvailableServiceClick}
            />
          </>
        )}

        {/* Details View (Table) */}
        {viewMode === 'details' && !isLoading && (
          <Paper withBorder p="md">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Title order={3}>
                  {getProviderLabel(selectedServiceProvider || '')} Integrations
                </Title>
                <Text c="dimmed" size="sm">
                  {filteredIntegrations.length} integration{filteredIntegrations.length !== 1 ? 's' : ''}
                </Text>
              </Group>

              {filteredIntegrations.length > 0 ? (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Created</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredIntegrations.map((integration) => (
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
                            <Tooltip label="Edit integration">
                              <ActionIcon 
                                color="gray" 
                                variant="light"
                                size="sm"
                                onClick={() => openEditModalForIntegration(integration)}
                              >
                                <IconEdit size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Manage permissions">
                              <ActionIcon 
                                color="purple" 
                                variant="light"
                                size="sm"
                                onClick={() => openPermissionsModalForIntegration(integration)}
                              >
                                <IconShare size={14} />
                              </ActionIcon>
                            </Tooltip>
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
                            {integration.provider === 'slack' && (
                              <Tooltip label="Refresh integration (update team info)">
                                <ActionIcon 
                                  color="green" 
                                  variant="light"
                                  size="sm"
                                  loading={refreshingIntegration === integration.id}
                                  onClick={() => handleRefreshSlackIntegration(integration.id)}
                                >
                                  <IconRefresh size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                            {integration.provider === 'whatsapp' && (
                              <Tooltip label="Manage WhatsApp settings">
                                <ActionIcon 
                                  color="green" 
                                  variant="light"
                                  size="sm"
                                  component={Link}
                                  href={`/integrations/whatsapp/${integration.id}`}
                                >
                                  <IconSettings size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
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
              ) : (
                <Stack align="center" py="xl">
                  <IconPlugConnected size={48} color="gray" />
                  <Text size="lg" fw={500}>No {getProviderLabel(selectedServiceProvider || '')} integrations found</Text>
                  <Text c="dimmed" ta="center">
                    Add your first {getProviderLabel(selectedServiceProvider || '')} integration to get started
                  </Text>
                </Stack>
              )}
            </Stack>
          </Paper>
        )}

        {/* Create Integration Modal */}
        <Modal 
          opened={opened} 
          onClose={() => {
            close();
            // Reset form when closing modal
            form.reset();
          }}
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
                readOnly={!!form.values.provider && form.values.provider !== 'fireflies'}
                {...form.getInputProps('provider')}
              />

              {/* OAuth Connect Button for OAuth providers */}
              {isOAuthProvider(form.values.provider) && (
                <Stack gap="md">
                  <Alert 
                    icon={<IconPlugConnected size={16} />}
                    title={`Connect with ${getProviderLabel(form.values.provider)}`}
                    color="blue"
                  >
                    <Text size="sm" mb="md">
                      Connect your {getProviderLabel(form.values.provider)} account using OAuth for secure authentication.
                      This will automatically set up the integration for you.
                    </Text>
                    <Button 
                      leftSection={<IconPlugConnected size={16} />}
                      onClick={() => handleOAuthConnect(form.values.provider)}
                      color="blue"
                      variant="filled"
                    >
                      Connect with {getProviderLabel(form.values.provider)}
                    </Button>
                  </Alert>

                  {form.values.provider === 'slack' && (
                    <Alert color="gray" title="Alternative: Manual Setup">
                      <Text size="sm">
                        If you prefer manual setup or need advanced configuration, 
                        you can continue with the manual form below instead of using OAuth.
                      </Text>
                    </Alert>
                  )}
                </Stack>
              )}

              {/* API Key input for non-OAuth providers */}
              {!isOAuthProvider(form.values.provider) && form.values.provider !== 'slack' && form.values.provider !== 'whatsapp' && form.values.provider !== 'email' && (
                <TextInput
                  label="API Key"
                  placeholder="Enter your API key"
                  required
                  type="password"
                  {...form.getInputProps('apiKey')}
                />
              )}

              {/* Manual configuration for OAuth providers (if they want to override OAuth) */}
              {isOAuthProvider(form.values.provider) && form.values.provider !== 'github' && (
                <>
                  <Text size="sm" c="dimmed" ta="center" my="md">
                    — or configure manually —
                  </Text>
                </>
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

                  <TextInput
                    label="App ID"
                    placeholder="A1234567890"
                    required
                    {...form.getInputProps('appId')}
                    description="Found in Basic Information > App ID. Required to distinguish between dev/prod apps in same workspace."
                  />
                </>
              )}

              {form.values.provider === 'whatsapp' && (
                <>
                  <Alert
                    icon={<IconPlugConnected size={16} />}
                    title="WhatsApp Business Setup Required"
                    color="blue"
                  >
                    You need to set up a WhatsApp Business Account in Meta Business Manager first. Visit{' '}
                    <Text component="a" href="https://business.facebook.com" target="_blank" style={{ textDecoration: 'underline' }}>
                      business.facebook.com
                    </Text>{' '}
                    to create your app and get the required credentials below.
                  </Alert>

                  <TextInput
                    label="Access Token"
                    placeholder="Your WhatsApp access token"
                    required
                    type="password"
                    {...form.getInputProps('whatsappAccessToken')}
                    description="Found in Meta Business Manager > Your App > WhatsApp > API Setup"
                  />

                  <TextInput
                    label="Phone Number ID"
                    placeholder="1234567890123456"
                    required
                    {...form.getInputProps('whatsappPhoneNumberId')}
                    description="Found in Meta Business Manager > Your App > WhatsApp > API Setup > Phone numbers"
                  />

                  <TextInput
                    label="Business Account ID"
                    placeholder="1234567890123456"
                    required
                    {...form.getInputProps('whatsappBusinessAccountId')}
                    description="Found in Meta Business Manager > Your App > WhatsApp > API Setup"
                  />

                  <TextInput
                    label="Webhook Verify Token"
                    placeholder="your-custom-verify-token"
                    required
                    {...form.getInputProps('whatsappWebhookVerifyToken')}
                    description="A custom token you create to verify webhook requests. You'll use this when setting up webhooks in Meta Business Manager."
                  />
                </>
              )}

              {form.values.provider === 'email' && (
                <>
                  <Alert
                    icon={<IconPlugConnected size={16} />}
                    title="Email Setup"
                    color="blue"
                  >
                    Connect your email so Zoe can read and send on your behalf. You&apos;ll need an App Password — not your regular password.
                    For Gmail: Google Account → Security → 2-Step Verification → App Passwords.
                    For Outlook: Microsoft Account → Security → App Passwords.
                  </Alert>

                  <Select
                    label="Email Provider"
                    data={[
                      { value: 'gmail', label: 'Gmail / Google Workspace' },
                      { value: 'outlook', label: 'Outlook / Microsoft 365' },
                      { value: 'custom', label: 'Custom (IMAP/SMTP)' },
                    ]}
                    {...form.getInputProps('emailProvider')}
                    description="Select your email provider for automatic server detection"
                  />

                  <TextInput
                    label="Email Address"
                    placeholder="you@example.com"
                    required
                    {...form.getInputProps('emailAddress')}
                    description="The email address you want Zoe to access"
                  />

                  <TextInput
                    label="App Password"
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    required
                    type="password"
                    {...form.getInputProps('emailAppPassword')}
                    description="An app-specific password (NOT your regular login password)"
                  />

                  {form.values.emailProvider === 'custom' && (
                    <>
                      <TextInput
                        label="IMAP Host"
                        placeholder="imap.example.com"
                        {...form.getInputProps('emailImapHost')}
                        description="IMAP server hostname for reading emails"
                      />

                      <TextInput
                        label="SMTP Host"
                        placeholder="smtp.example.com"
                        {...form.getInputProps('emailSmtpHost')}
                        description="SMTP server hostname for sending emails"
                      />
                    </>
                  )}
                </>
              )}

              <Textarea
                label="Description (Optional)"
                placeholder="What will this integration be used for?"
                {...form.getInputProps('description')}
                minRows={2}
              />

              <Checkbox
                label="Allow all team members to use this integration"
                description="Team members will automatically have access to configure this integration in their projects"
                {...form.getInputProps('allowTeamMemberAccess', { type: 'checkbox' })}
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

              {form.values.provider === 'monday' && (
                <Alert 
                  icon={<IconAlertCircle size={16} />}
                  title="Monday.com Setup"
                  color="blue"
                >
                  Get your personal API token from Monday.com by going to{' '}
                  <Text component="a" href="https://your-workspace.monday.com/admin/integrations/api" target="_blank" style={{ textDecoration: 'underline' }}>
                    /admin/integrations/api
                  </Text>{' '}
                  and clicking &apos;Generate&apos; next to &quot;Personal API Token&quot;. Your token will be tested to ensure it has access to your boards.
                </Alert>
              )}

              <Group justify="flex-end">
                <Button variant="light" onClick={() => {
                  close();
                  form.reset();
                }}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  loading={createIntegration.isPending || createSlackIntegration.isPending || createWhatsAppIntegration.isPending}
                >
                  Create Integration
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>

        {/* Edit Integration Modal */}
        <Modal 
          opened={editModalOpened} 
          onClose={() => {
            closeEditModal();
            setEditingIntegration(null);
          }}
          title="Edit Integration"
          size="md"
        >
          {integrationDetails && (
            <form onSubmit={editForm.onSubmit(handleEditIntegration)}>
              <Stack gap="md">
                <TextInput
                  label="Integration Name"
                  placeholder="e.g., My Fireflies Account"
                  required
                  {...editForm.getInputProps('name')}
                />

                <Textarea
                  label="Description (Optional)"
                  placeholder="What will this integration be used for?"
                  {...editForm.getInputProps('description')}
                  minRows={2}
                />

                <Checkbox
                  label="Allow all team members to use this integration"
                  description="Team members will automatically have access to configure this integration in their projects"
                  {...editForm.getInputProps('allowTeamMemberAccess', { type: 'checkbox' })}
                />

                {integrationDetails.provider === 'slack' && (
                  <>
                    <Alert 
                      icon={<IconBrandSlack size={16} />}
                      title="Slack App Configuration"
                      color="blue"
                    >
                      Adding the App ID helps distinguish between different Slack apps (e.g., dev vs prod) 
                      in the same workspace. Find your App ID in your Slack app&apos;s Basic Information section.
                    </Alert>

                    <TextInput
                      label="App ID"
                      placeholder="A1234567890"
                      required
                      {...editForm.getInputProps('appId')}
                      description="Found in Basic Information > App ID. Required to distinguish between dev/prod apps in same workspace."
                    />

                    {integrationDetails.scope === 'team' && (
                      <Alert 
                        color="orange"
                        title="Team Integration"
                      >
                        This is a team integration for &quot;{integrationDetails.teamName}&quot;. 
                        Changes will affect all team members.
                      </Alert>
                    )}
                  </>
                )}

                <Group justify="flex-end">
                  <Button 
                    variant="light" 
                    onClick={() => {
                      closeEditModal();
                      setEditingIntegration(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    loading={updateIntegration.isPending}
                  >
                    Update Integration
                  </Button>
                </Group>
              </Stack>
            </form>
          )}
        </Modal>

        {/* Permissions Modal */}
        <Modal 
          opened={permissionsModalOpened} 
          onClose={() => {
            closePermissionsModal();
            setPermissionsIntegration(null);
          }}
          title="Manage Integration Permissions"
          size="lg"
        >
          {permissionsIntegration && (
            <IntegrationPermissionManager
              integrationId={permissionsIntegration.id}
              integrationName={permissionsIntegration.name}
              isOwner={true} // For now, assume user is owner since they can see it in their list
            />
          )}
        </Modal>
      </Stack>
    </Container>
  );
}