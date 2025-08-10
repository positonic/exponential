'use client';

import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Paper,
  Stack,
  Group,
  Button,
  Badge,
  Alert,
  TextInput,
  LoadingOverlay,
  ActionIcon,
  Tooltip,
  Modal,
  Card,
  Divider,
  Code,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconAlertCircle,
  IconTestPipe,
  IconRefresh,
  IconBrandWhatsapp,
  IconSend,
  IconTemplate,
  IconPhone,
  IconSettings,
  IconUsers,
  IconChartBar,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useRouter } from 'next/navigation';
import { WhatsAppPhoneMapping } from './WhatsAppPhoneMapping';
import { WhatsAppMonitoringDashboard } from './WhatsAppMonitoringDashboard';

interface WhatsAppIntegrationSettingsProps {
  integrationId: string;
}

export function WhatsAppIntegrationSettings({ integrationId }: WhatsAppIntegrationSettingsProps) {
  const router = useRouter();
  const [testModalOpened, { open: openTestModal, close: closeTestModal }] = useDisclosure(false);
  const [phoneMappingOpened, { open: openPhoneMapping, close: closePhoneMapping }] = useDisclosure(false);
  const [monitoringOpened, { open: openMonitoring, close: closeMonitoring }] = useDisclosure(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Fetch WhatsApp config
  const { data: config, isLoading, refetch } = api.whatsapp.getConfig.useQuery(
    { integrationId },
    {
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  // Test connection mutation
  const testConnection = api.whatsapp.testConnection.useQuery(
    { integrationId },
    {
      enabled: false,
    }
  );

  // Send test message mutation
  const sendTestMessage = api.whatsapp.sendTestMessage.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Test Message Sent',
        message: 'Successfully sent test message via WhatsApp',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      closeTestModal();
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to Send Message',
        message: error.message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const testForm = useForm({
    initialValues: {
      phoneNumber: '',
      message: 'Hello! This is a test message from Exponential.',
    },
    validate: {
      phoneNumber: (value) => {
        if (!value) return 'Phone number is required';
        if (!value.match(/^\+?[1-9]\d{1,14}$/)) {
          return 'Invalid phone number format. Use international format (e.g., +1234567890)';
        }
        return null;
      },
      message: (value) => {
        if (!value || value.trim().length === 0) return 'Message is required';
        if (value.length > 1000) return 'Message too long (max 1000 characters)';
        return null;
      },
    },
  });

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const result = await testConnection.refetch();
      if (result.data?.success) {
        notifications.show({
          title: 'Connection Successful',
          message: `Connected to ${result.data.businessName || 'WhatsApp Business'}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
      } else {
        notifications.show({
          title: 'Connection Failed',
          message: result.data?.error || 'Failed to connect to WhatsApp',
          color: 'red',
          icon: <IconAlertCircle size={16} />,
        });
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSendTestMessage = async (values: typeof testForm.values) => {
    await sendTestMessage.mutateAsync({
      integrationId,
      phoneNumber: values.phoneNumber,
      message: values.message,
    });
  };

  if (isLoading) {
    return (
      <Container size="lg" py="xl">
        <Paper withBorder p="md">
          <LoadingOverlay visible={true} />
          <div style={{ height: 400 }} />
        </Paper>
      </Container>
    );
  }

  if (!config) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          WhatsApp configuration not found
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>WhatsApp Integration Settings</Title>
            <Text c="dimmed" size="sm">
              Manage your WhatsApp Business integration
            </Text>
          </div>
          <Button
            leftSection={<IconSettings size={16} />}
            variant="light"
            onClick={() => router.push('/integrations')}
          >
            Back to Integrations
          </Button>
        </Group>

        {/* Status Card */}
        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Group>
              <IconBrandWhatsapp size={32} color="var(--mantine-color-green-6)" />
              <div>
                <Text fw={500} size="lg">{config.integration.name}</Text>
                <Text size="sm" c="dimmed">
                  {config.businessName || 'WhatsApp Business Account'}
                </Text>
              </div>
            </Group>
            <Badge
              color={config.integration.status === 'ACTIVE' ? 'green' : 'red'}
              size="lg"
            >
              {config.integration.status}
            </Badge>
          </Group>

          <Divider my="md" />

          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Phone Number</Text>
              <Text size="sm" fw={500}>
                {config.displayPhoneNumber || config.phoneNumberId}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Business Name</Text>
              <Text size="sm" fw={500}>
                {config.businessName || 'Not configured'}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Phone Number ID</Text>
              <Code>{config.phoneNumberId}</Code>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Business Account ID</Text>
              <Code>{config.businessAccountId}</Code>
            </Group>
          </Stack>

          <Group mt="md">
            <Button
              leftSection={<IconTestPipe size={16} />}
              onClick={handleTestConnection}
              loading={isTestingConnection}
            >
              Test Connection
            </Button>
            <Button
              leftSection={<IconSend size={16} />}
              variant="light"
              onClick={openTestModal}
            >
              Send Test Message
            </Button>
          </Group>
        </Card>

        {/* Webhook Configuration */}
        <Card withBorder>
          <Group mb="md">
            <IconSettings size={24} />
            <Text fw={500} size="lg">Webhook Configuration</Text>
          </Group>
          
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Webhook URL"
            color="blue"
            mb="md"
          >
            Configure this URL in your Meta Business Manager webhook settings:
            <Code block mt="xs">
              {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : 'https://your-domain.com/api/webhooks/whatsapp'}
            </Code>
          </Alert>

          <Stack gap="xs">
            <Text size="sm">
              <strong>Webhook Fields to Subscribe:</strong>
            </Text>
            <Text size="sm" c="dimmed">• messages</Text>
            <Text size="sm" c="dimmed">• message_template_status_update</Text>
            <Text size="sm" c="dimmed">• phone_number_name_update</Text>
          </Stack>
        </Card>

        {/* Analytics & Monitoring */}
        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Group>
              <IconChartBar size={24} />
              <Text fw={500} size="lg">Analytics & Monitoring</Text>
            </Group>
            <Button
              leftSection={<IconChartBar size={16} />}
              variant="light"
              onClick={openMonitoring}
            >
              View Dashboard
            </Button>
          </Group>
          
          <Text size="sm" c="dimmed">
            Monitor real-time performance, message analytics, system health, and security metrics. 
            Track message volumes, delivery rates, and user engagement patterns.
          </Text>
        </Card>

        {/* Phone Number Mapping */}
        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Group>
              <IconUsers size={24} />
              <Text fw={500} size="lg">Phone Number Mapping</Text>
            </Group>
            <Button
              leftSection={<IconPhone size={16} />}
              variant="light"
              onClick={openPhoneMapping}
            >
              Manage Mappings
            </Button>
          </Group>
          
          <Text size="sm" c="dimmed">
            Link WhatsApp phone numbers to users in your system. This allows the system to automatically 
            identify users when they send messages from their registered phone numbers.
          </Text>
        </Card>

        {/* Message Templates */}
        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Group>
              <IconTemplate size={24} />
              <Text fw={500} size="lg">Message Templates</Text>
            </Group>
            <Button
              leftSection={<IconRefresh size={16} />}
              variant="light"
              size="sm"
              onClick={() => refetch()}
            >
              Refresh
            </Button>
          </Group>

          {config.templates && config.templates.length > 0 ? (
            <Stack gap="sm">
              {config.templates.map((template) => (
                <Paper key={template.id} withBorder p="sm">
                  <Group justify="space-between">
                    <div>
                      <Text fw={500}>{template.name}</Text>
                      <Text size="xs" c="dimmed">
                        {template.language} • {template.category}
                      </Text>
                    </div>
                    <Badge
                      color={
                        template.status === 'APPROVED' ? 'green' :
                        template.status === 'PENDING' ? 'yellow' : 'red'
                      }
                    >
                      {template.status}
                    </Badge>
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Text c="dimmed" ta="center" py="xl">
              No message templates configured
            </Text>
          )}
        </Card>
      </Stack>

      {/* Test Message Modal */}
      <Modal
        opened={testModalOpened}
        onClose={closeTestModal}
        title="Send Test Message"
        size="md"
      >
        <form onSubmit={testForm.onSubmit(handleSendTestMessage)}>
          <Stack gap="md">
            <Alert
              icon={<IconPhone size={16} />}
              color="blue"
            >
              Make sure the recipient has opted in to receive messages from your WhatsApp Business account.
            </Alert>

            <TextInput
              label="Recipient Phone Number"
              placeholder="+1234567890"
              description="Use international format with country code"
              required
              {...testForm.getInputProps('phoneNumber')}
            />

            <TextInput
              label="Message"
              placeholder="Enter your test message"
              required
              {...testForm.getInputProps('message')}
            />

            <Group justify="flex-end">
              <Button variant="light" onClick={closeTestModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                leftSection={<IconSend size={16} />}
                loading={sendTestMessage.isPending}
              >
                Send Message
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Phone Mapping Modal */}
      <WhatsAppPhoneMapping
        integrationId={integrationId}
        opened={phoneMappingOpened}
        onClose={closePhoneMapping}
      />

      {/* Monitoring Dashboard Modal */}
      <Modal
        opened={monitoringOpened}
        onClose={closeMonitoring}
        title="WhatsApp Analytics & Monitoring"
        size="100%"
        fullScreen
      >
        <WhatsAppMonitoringDashboard integrationId={integrationId} />
      </Modal>
    </Container>
  );
}