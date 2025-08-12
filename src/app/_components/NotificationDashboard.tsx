'use client';

import { useState } from 'react';
import {
  Card,
  Stack,
  Title,
  Text,
  Group,
  Badge,
  Table,
  ScrollArea,
  Button,
  ActionIcon,
  RingProgress,
  SimpleGrid,
  ThemeIcon,
  Tooltip,
  Select,
} from '@mantine/core';
import {
  IconBell,
  IconCheck,
  IconX,
  IconClock,
  IconRefresh,
  IconSend,
  IconAlertCircle,
  IconCalendar,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatDistanceToNow } from 'date-fns';

const notificationTypes = {
  task_reminder: { label: 'Task Reminder', icon: IconClock, color: 'blue' },
  daily_summary: { label: 'Daily Summary', icon: IconCalendar, color: 'green' },
  weekly_summary: { label: 'Weekly Summary', icon: IconCalendar, color: 'purple' },
  project_update: { label: 'Project Update', icon: IconBell, color: 'orange' },
} as const;

const statusColors = {
  pending: 'blue',
  sent: 'green',
  failed: 'red',
  cancelled: 'gray',
} as const;

export function NotificationDashboard() {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Get notification stats
  const { data: stats, refetch: refetchStats } = api.notification.getNotificationStats.useQuery();

  // Get scheduled notifications
  const { data: notifications, refetch: refetchNotifications } = api.notification.getScheduledNotifications.useQuery({
    status: statusFilter as any,
    type: typeFilter || undefined,
    limit: 50,
  });

  // Get user preferences
  const { data: preferences } = api.notification.getPreferences.useQuery();

  // Cancel notification mutation
  const cancelNotification = api.notification.cancelNotification.useMutation({
    onSuccess: () => {
      void refetchNotifications();
      void refetchStats();
    },
  });

  // Test notification mutation
  const sendTest = api.notification.sendTestNotification.useMutation({
    onSuccess: () => {
      void refetchNotifications();
    },
  });

  const handleRefresh = () => {
    void refetchStats();
    void refetchNotifications();
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Notification Dashboard</Title>
        <Group>
          <Button
            variant="light"
            leftSection={<IconSend size={16} />}
            onClick={() => sendTest.mutate({ type: 'daily_summary' })}
            loading={sendTest.isPending}
          >
            Send Test
          </Button>
          <ActionIcon
            variant="light"
            onClick={handleRefresh}
            size="lg"
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Stats Cards */}
      <SimpleGrid cols={4}>
        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Total (30d)
              </Text>
              <Text size="xl" fw={700}>{stats?.total || 0}</Text>
            </div>
            <ThemeIcon color="gray" variant="light" size="xl">
              <IconBell size={24} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Sent
              </Text>
              <Text size="xl" fw={700} c="green">{stats?.sent || 0}</Text>
            </div>
            <ThemeIcon color="green" variant="light" size="xl">
              <IconCheck size={24} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Failed
              </Text>
              <Text size="xl" fw={700} c="red">{stats?.failed || 0}</Text>
            </div>
            <ThemeIcon color="red" variant="light" size="xl">
              <IconX size={24} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Success Rate
              </Text>
              <RingProgress
                size={60}
                thickness={6}
                sections={[
                  { value: stats?.successRate || 0, color: 'green' },
                ]}
                label={
                  <Text size="xs" ta="center">
                    {stats?.successRate || 0}%
                  </Text>
                }
              />
            </div>
          </Group>
        </Card>
      </SimpleGrid>

      {/* Status Card */}
      <Card withBorder>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600}>Notification Status</Text>
            <Badge
              color={preferences?.enabled ? 'green' : 'red'}
              variant="light"
            >
              {preferences?.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </Group>
          
          {preferences?.enabled && (
            <Group gap="xs">
              <Text size="sm" c="dimmed">Active notifications:</Text>
              {preferences.taskReminders && (
                <Badge size="sm" variant="light">Task Reminders</Badge>
              )}
              {preferences.dailySummary && (
                <Badge size="sm" variant="light">Daily Summary</Badge>
              )}
              {preferences.weeklySummary && (
                <Badge size="sm" variant="light">Weekly Summary</Badge>
              )}
              {preferences.projectUpdates && (
                <Badge size="sm" variant="light">Project Updates</Badge>
              )}
            </Group>
          )}
          
          {stats?.pending && stats.pending > 0 && (
            <Group gap="xs">
              <IconClock size={16} />
              <Text size="sm">{stats.pending} notifications pending</Text>
            </Group>
          )}
        </Stack>
      </Card>

      {/* Notifications Table */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Recent Notifications</Title>
            <Group gap="xs">
              <Select
                placeholder="Filter by status"
                data={[
                  { value: '', label: 'All Status' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'sent', label: 'Sent' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
                value={statusFilter}
                onChange={setStatusFilter}
                clearable
                style={{ width: 150 }}
              />
              <Select
                placeholder="Filter by type"
                data={[
                  { value: '', label: 'All Types' },
                  ...Object.entries(notificationTypes).map(([value, { label }]) => ({
                    value,
                    label,
                  })),
                ]}
                value={typeFilter}
                onChange={setTypeFilter}
                clearable
                style={{ width: 180 }}
              />
            </Group>
          </Group>

          <ScrollArea h={400}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Scheduled</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {notifications?.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" ta="center" py="md">
                        No notifications found
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  notifications?.map((notification) => {
                    const typeInfo = notificationTypes[notification.type as keyof typeof notificationTypes];
                    const Icon = typeInfo?.icon || IconBell;
                    
                    return (
                      <Table.Tr key={notification.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <ThemeIcon
                              color={typeInfo?.color || 'gray'}
                              variant="light"
                              size="sm"
                            >
                              <Icon size={16} />
                            </ThemeIcon>
                            <Text size="sm">{typeInfo?.label || notification.type}</Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" lineClamp={1}>{notification.title}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Tooltip label={new Date(notification.scheduledFor).toLocaleString()}>
                            <Text size="sm">
                              {formatDistanceToNow(new Date(notification.scheduledFor), { addSuffix: true })}
                            </Text>
                          </Tooltip>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            color={statusColors[notification.status as keyof typeof statusColors]}
                            variant="light"
                            size="sm"
                          >
                            {notification.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {notification.status === 'pending' && (
                            <Tooltip label="Cancel notification">
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="sm"
                                onClick={() => cancelNotification.mutate({ notificationId: notification.id })}
                                loading={cancelNotification.isPending}
                              >
                                <IconX size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          {notification.status === 'failed' && notification.lastError && (
                            <Tooltip label={notification.lastError}>
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="sm"
                              >
                                <IconAlertCircle size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Card>
    </Stack>
  );
}