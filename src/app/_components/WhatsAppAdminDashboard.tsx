'use client';

import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Tabs,
  Card,
  SimpleGrid,
  Stack,
  Group,
  Badge,
  Button,
  ActionIcon,
  Alert,
  Table,
  Modal,
  TextInput,
  Select,
  Switch,
} from '@mantine/core';
import {
  IconSettings,
  IconUsers,
  IconChartBar,
  IconShield,
  IconPlus,
  IconEdit,
  IconTrash,
  IconRefresh,
  IconAlertCircle,
  IconCheck,
  IconBrandWhatsapp,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { api } from '~/trpc/react';
import { notifications } from '@mantine/notifications';

export function WhatsAppAdminDashboard() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [userModalOpened, { open: openUserModal, close: closeUserModal }] = useDisclosure(false);
  const [integrationModalOpened, { open: openIntegrationModal, close: closeIntegrationModal }] = useDisclosure(false);

  // Fetch all WhatsApp integrations for admin view
  const { data: integrations, isLoading: integrationsLoading, refetch: refetchIntegrations } = 
    api.integration.getAllWhatsAppIntegrations.useQuery();

  // Fetch user mappings across all integrations
  const { data: userMappings, isLoading: mappingsLoading, refetch: refetchMappings } = 
    api.integration.getAllWhatsAppUserMappings.useQuery();

  // Fetch system-wide analytics
  const { data: systemAnalytics, refetch: refetchAnalytics } = 
    api.integration.getSystemWhatsAppAnalytics.useQuery();

  const handleRefreshAll = () => {
    void refetchIntegrations();
    void refetchMappings();
    void refetchAnalytics();
    notifications.show({
      title: 'Data Refreshed',
      message: 'All admin data has been refreshed',
      color: 'green',
      icon: <IconCheck size={16} />,
    });
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>WhatsApp Admin Dashboard</Title>
            <Text c="dimmed" size="sm">
              Manage WhatsApp integrations, user access, and view system-wide analytics
            </Text>
          </div>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={handleRefreshAll}
          >
            Refresh All Data
          </Button>
        </Group>

        {/* Quick Stats */}
        <SimpleGrid cols={4}>
          <Card withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Active Integrations
                </Text>
                <Text size="xl" fw={700}>
                  {integrations?.filter(i => i.status === 'ACTIVE').length || 0}
                </Text>
              </div>
              <IconBrandWhatsapp size={24} color="var(--mantine-color-green-6)" />
            </Group>
          </Card>

          <Card withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Users
                </Text>
                <Text size="xl" fw={700}>
                  {userMappings?.length || 0}
                </Text>
              </div>
              <IconUsers size={24} color="var(--mantine-color-blue-6)" />
            </Group>
          </Card>

          <Card withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Messages Today
                </Text>
                <Text size="xl" fw={700}>
                  {systemAnalytics?.todayMessages || 0}
                </Text>
              </div>
              <IconChartBar size={24} color="var(--mantine-color-teal-6)" />
            </Group>
          </Card>

          <Card withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  System Health
                </Text>
                <Badge
                  color={
                    systemAnalytics?.systemHealth === 'healthy' ? 'green' :
                    systemAnalytics?.systemHealth === 'degraded' ? 'yellow' : 'red'
                  }
                  size="lg"
                >
                  {systemAnalytics?.systemHealth || 'Unknown'}
                </Badge>
              </div>
              <IconShield size={24} color="var(--mantine-color-red-6)" />
            </Group>
          </Card>
        </SimpleGrid>

        {/* Main Content */}
        <Tabs value={activeTab} onChange={(value) => value && setActiveTab(value)}>
          <Tabs.List>
            <Tabs.Tab value="overview" leftSection={<IconChartBar size={16} />}>
              Overview
            </Tabs.Tab>
            <Tabs.Tab value="integrations" leftSection={<IconSettings size={16} />}>
              Integrations
            </Tabs.Tab>
            <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
              User Management
            </Tabs.Tab>
            <Tabs.Tab value="security" leftSection={<IconShield size={16} />}>
              Security & Audit
            </Tabs.Tab>
          </Tabs.List>

          {/* Overview Tab */}
          <Tabs.Panel value="overview" pt="lg">
            <SimpleGrid cols={2}>
              <Card withBorder>
                <Title order={4} mb="md">System Status</Title>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm">Database Connection</Text>
                    <Badge color="green" size="sm">Healthy</Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Message Queue</Text>
                    <Badge color="green" size="sm">Active</Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Cache Service</Text>
                    <Badge color="green" size="sm">Running</Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Circuit Breakers</Text>
                    <Badge color="green" size="sm">Closed</Badge>
                  </Group>
                </Stack>
              </Card>

              <Card withBorder>
                <Title order={4} mb="md">Recent Activity</Title>
                <Text size="sm" c="dimmed">
                  This section would show recent system events, errors, and important changes
                  across all WhatsApp integrations.
                </Text>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          {/* Integrations Tab */}
          <Tabs.Panel value="integrations" pt="lg">
            <Card withBorder>
              <Group justify="space-between" mb="md">
                <Title order={4}>WhatsApp Integrations</Title>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={openIntegrationModal}
                >
                  Add Integration
                </Button>
              </Group>

              {integrationsLoading ? (
                <Text>Loading integrations...</Text>
              ) : (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Business Name</Table.Th>
                      <Table.Th>Phone Number</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Created</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {integrations?.map((integration) => (
                      <Table.Tr key={integration.id}>
                        <Table.Td>{integration.name}</Table.Td>
                        <Table.Td>{(integration as any).whatsapp?.businessName || 'N/A'}</Table.Td>
                        <Table.Td>{(integration as any).whatsapp?.displayPhoneNumber || 'N/A'}</Table.Td>
                        <Table.Td>
                          <Badge color="green">
                            ACTIVE
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {new Date(integration.createdAt).toLocaleDateString()}
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <ActionIcon
                              variant="light"
                              size="sm"
                              onClick={() => {/* Navigate to integration details */}}
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                            <ActionIcon
                              variant="light"
                              color="red"
                              size="sm"
                              onClick={() => {/* Delete integration */}}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </Tabs.Panel>

          {/* User Management Tab */}
          <Tabs.Panel value="users" pt="lg">
            <Card withBorder>
              <Group justify="space-between" mb="md">
                <Title order={4}>User Phone Number Mappings</Title>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={openUserModal}
                >
                  Add User Mapping
                </Button>
              </Group>

              {mappingsLoading ? (
                <Text>Loading user mappings...</Text>
              ) : (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>User Name</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Phone Number</Table.Th>
                      <Table.Th>Integration</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {userMappings?.map((mapping) => (
                      <Table.Tr key={mapping.id}>
                        <Table.Td>{mapping.user?.name || 'Unknown'}</Table.Td>
                        <Table.Td>{mapping.user?.email || 'N/A'}</Table.Td>
                        <Table.Td>{mapping.externalUserId}</Table.Td>
                        <Table.Td>{mapping.integration?.name || 'N/A'}</Table.Td>
                        <Table.Td>
                          <Badge color="green">Active</Badge>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <ActionIcon
                              variant="light"
                              size="sm"
                              onClick={() => {/* Edit mapping */}}
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                            <ActionIcon
                              variant="light"
                              color="red"
                              size="sm"
                              onClick={() => {/* Delete mapping */}}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </Tabs.Panel>

          {/* Security & Audit Tab */}
          <Tabs.Panel value="security" pt="lg">
            <Stack gap="md">
              <Alert
                icon={<IconAlertCircle />}
                title="Security Monitoring"
                color="blue"
              >
                This section provides security monitoring and audit logs for all WhatsApp integrations.
                Monitor suspicious activity, failed authentication attempts, and rate limit violations.
              </Alert>

              <Card withBorder>
                <Title order={4} mb="md">Security Settings</Title>
                <Stack gap="md">
                  <Group justify="space-between">
                    <div>
                      <Text fw={500}>Enable Rate Limit Monitoring</Text>
                      <Text size="sm" c="dimmed">
                        Monitor and alert on API rate limit violations
                      </Text>
                    </div>
                    <Switch defaultChecked />
                  </Group>

                  <Group justify="space-between">
                    <div>
                      <Text fw={500}>Enable Security Audit Logging</Text>
                      <Text size="sm" c="dimmed">
                        Log all security-related events and access attempts
                      </Text>
                    </div>
                    <Switch defaultChecked />
                  </Group>

                  <Group justify="space-between">
                    <div>
                      <Text fw={500}>Enable Suspicious Pattern Detection</Text>
                      <Text size="sm" c="dimmed">
                        Automatically detect and flag suspicious message patterns
                      </Text>
                    </div>
                    <Switch defaultChecked />
                  </Group>
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Modals for adding users and integrations */}
        <Modal
          opened={userModalOpened}
          onClose={closeUserModal}
          title="Add User Phone Mapping"
          size="md"
        >
          <Stack gap="md">
            <Select
              label="Select User"
              placeholder="Choose a user"
              data={[]} // This would be populated with actual users
            />
            <TextInput
              label="Phone Number"
              placeholder="+1234567890"
              description="International format with country code"
            />
            <Select
              label="WhatsApp Integration"
              placeholder="Select integration"
              data={[]} // This would be populated with integrations
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={closeUserModal}>
                Cancel
              </Button>
              <Button>Add Mapping</Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={integrationModalOpened}
          onClose={closeIntegrationModal}
          title="Add WhatsApp Integration"
          size="md"
        >
          <Stack gap="md">
            <TextInput
              label="Integration Name"
              placeholder="My WhatsApp Integration"
              required
            />
            <TextInput
              label="Business Account ID"
              placeholder="Enter Business Account ID"
              required
            />
            <TextInput
              label="Phone Number ID"
              placeholder="Enter Phone Number ID"
              required
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={closeIntegrationModal}>
                Cancel
              </Button>
              <Button>Add Integration</Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}