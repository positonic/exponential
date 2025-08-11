'use client';

import { useState } from 'react';
import {
  Card,
  SimpleGrid,
  Text,
  Title,
  Progress,
  Group,
  Stack,
  Select,
  LoadingOverlay,
  Badge,
  ActionIcon,
  Tooltip,
  Paper,
  RingProgress,
  Center,
} from '@mantine/core';
import {
  IconRefresh,
  IconTrendingUp,
  IconTrendingDown,
  IconMessages,
  IconUsers,
  IconClock,
  IconAlertCircle,
  IconChartBar,
  IconActivity,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatDistanceToNow } from 'date-fns';
// Charts will be implemented with a simpler approach for now
// TODO: Add proper chart library integration

interface WhatsAppAnalyticsDashboardProps {
  integrationId: string;
}

export function WhatsAppAnalyticsDashboard({ integrationId }: WhatsAppAnalyticsDashboardProps) {
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    new Date(),
  ]);
  const [refreshInterval, setRefreshInterval] = useState<string>('30000'); // 30 seconds

  // Get WhatsApp config
  const { data: config } = api.whatsapp.getConfig.useQuery(
    { integrationId },
    { enabled: !!integrationId }
  );

  // Get analytics summary
  const { data: analytics, isLoading, refetch } = api.integration.getWhatsAppAnalytics.useQuery(
    {
      integrationId,
      startDate: dateRange[0] || undefined,
      endDate: dateRange[1] || undefined,
    },
    {
      enabled: !!integrationId && !!dateRange[0] && !!dateRange[1],
      refetchInterval: parseInt(refreshInterval),
    }
  );

  // Get health status
  const { data: health } = api.integration.getWhatsAppHealth.useQuery(
    { integrationId },
    {
      enabled: !!integrationId,
      refetchInterval: parseInt(refreshInterval),
    }
  );

  // Get worker status
  const { data: workerStatus } = api.integration.getWhatsAppWorkerStatus.useQuery(
    { integrationId },
    {
      enabled: !!integrationId,
      refetchInterval: parseInt(refreshInterval),
    }
  );

  const deliveryRate = analytics?.totals.messagesSent > 0
    ? (analytics.totals.messagesDelivered / analytics.totals.messagesSent) * 100
    : 0;

  const readRate = analytics?.totals.messagesDelivered > 0
    ? (analytics.totals.messagesRead / analytics.totals.messagesDelivered) * 100
    : 0;

  const errorRate = analytics?.totals.messagesReceived + analytics?.totals.messagesSent > 0
    ? (analytics.totals.errorCount / (analytics.totals.messagesReceived + analytics.totals.messagesSent)) * 100
    : 0;

  // Prepare chart data
  const hourlyData = analytics?.hourlyData.map(h => ({
    time: `${h.date.toLocaleDateString()} ${h.hour}:00`,
    received: h.messagesReceived,
    sent: h.messagesSent,
    delivered: h.messagesDelivered,
    failed: h.messagesFailed,
  })) || [];

  const performanceData = analytics?.hourlyData.map(h => ({
    time: `${h.date.toLocaleDateString()} ${h.hour}:00`,
    avgResponseTime: h.avgResponseTime,
    errorRate: h.errorRate ? h.errorRate * 100 : 0,
  })) || [];

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>WhatsApp Analytics</Title>
        <Group>
          <Select
            value={refreshInterval}
            onChange={value => setRefreshInterval(value || '30000')}
            data={[
              { value: '0', label: 'Manual' },
              { value: '10000', label: '10 seconds' },
              { value: '30000', label: '30 seconds' },
              { value: '60000', label: '1 minute' },
              { value: '300000', label: '5 minutes' },
            ]}
            w={150}
          />
          <DatePickerInput
            type="range"
            placeholder="Select date range"
            value={dateRange}
            onChange={setDateRange}
            w={300}
          />
          <ActionIcon
            variant="light"
            onClick={() => refetch()}
            loading={isLoading}
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>
      </Group>

      <LoadingOverlay visible={isLoading} />

      {/* System Health Status */}
      <SimpleGrid cols={4}>
        <Card>
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              System Health
            </Text>
            <IconActivity size={16} />
          </Group>
          <Group gap="xs">
            <Badge
              color={
                health?.status === 'healthy' ? 'green' :
                health?.status === 'degraded' ? 'yellow' : 'red'
              }
              size="lg"
            >
              {health?.status || 'Unknown'}
            </Badge>
            <Text size="xs" c="dimmed">
              Uptime: {health?.uptime ? formatDistanceToNow(Date.now() - health.uptime) : 'N/A'}
            </Text>
          </Group>
        </Card>

        <Card>
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Worker Status
            </Text>
            <IconChartBar size={16} />
          </Group>
          <Group gap="xs">
            <Badge
              color={
                workerStatus?.status === 'active' ? 'green' :
                workerStatus?.status === 'idle' ? 'blue' : 'red'
              }
              size="lg"
            >
              {workerStatus?.status || 'Unknown'}
            </Badge>
            <Text size="xs" c="dimmed">
              Queue: {workerStatus?.workers.queue.queue.size || 0}
            </Text>
          </Group>
        </Card>

        <Card>
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Cache Hit Rate
            </Text>
            <IconTrendingUp size={16} />
          </Group>
          <Progress
            value={workerStatus?.performance.cacheMetrics.hitRate * 100 || 0}
            color="teal"
            size="lg"
            label={`${Math.round(workerStatus?.performance.cacheMetrics.hitRate * 100 || 0)}%`}
          />
        </Card>

        <Card>
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Error Rate
            </Text>
            <IconAlertCircle size={16} />
          </Group>
          <Progress
            value={errorRate}
            color={errorRate > 5 ? 'red' : errorRate > 2 ? 'yellow' : 'green'}
            size="lg"
            label={`${errorRate.toFixed(2)}%`}
          />
        </Card>
      </SimpleGrid>

      {/* Message Volume Metrics */}
      <SimpleGrid cols={3}>
        <Card>
          <Stack>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Messages Sent
                </Text>
                <Text size="xl" fw={700}>
                  {analytics?.totals.messagesSent.toLocaleString() || '0'}
                </Text>
              </div>
              <IconMessages size={24} color="blue" />
            </Group>
            <Progress
              value={deliveryRate}
              color="blue"
              size="sm"
              label={`${deliveryRate.toFixed(1)}% delivered`}
            />
          </Stack>
        </Card>

        <Card>
          <Stack>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Messages Received
                </Text>
                <Text size="xl" fw={700}>
                  {analytics?.totals.messagesReceived.toLocaleString() || '0'}
                </Text>
              </div>
              <IconMessages size={24} color="green" />
            </Group>
            <Text size="xs" c="dimmed">
              From {analytics?.totals.uniqueUsers || 0} unique users
            </Text>
          </Stack>
        </Card>

        <Card>
          <Stack>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Read Rate
                </Text>
                <Text size="xl" fw={700}>
                  {readRate.toFixed(1)}%
                </Text>
              </div>
              <Center>
                <RingProgress
                  size={60}
                  thickness={6}
                  sections={[
                    { value: readRate, color: 'green' },
                  ]}
                />
              </Center>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Performance Metrics */}
      <SimpleGrid cols={3}>
        <Card>
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Avg Response Time
            </Text>
            <IconClock size={16} />
          </Group>
          <Text size="xl" fw={700}>
            {analytics?.averages.avgResponseTime?.toFixed(0) || '0'} ms
          </Text>
          <Text size="xs" c="dimmed">
            Max: {analytics?.hourlyData.reduce((max, h) => 
              Math.max(max, h.maxResponseTime || 0), 0
            ).toFixed(0)} ms
          </Text>
        </Card>

        <Card>
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Messages Per User
            </Text>
            <IconUsers size={16} />
          </Group>
          <Text size="xl" fw={700}>
            {analytics?.averages.avgMessagesPerUser?.toFixed(1) || '0'}
          </Text>
          <Text size="xs" c="dimmed">
            Total conversations: {analytics?.totals.totalConversations || 0}
          </Text>
        </Card>

        <Card>
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Avg Conversation Length
            </Text>
            <IconClock size={16} />
          </Group>
          <Text size="xl" fw={700}>
            {analytics?.averages.avgConversationLength?.toFixed(1) || '0'} min
          </Text>
        </Card>
      </SimpleGrid>

      {/* Charts */}
      <SimpleGrid cols={2}>
        <Paper p="md" withBorder>
          <Title order={4} mb="md">Message Volume Over Time</Title>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <ChartTooltip />
              <Legend />
              <Area type="monotone" dataKey="received" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
              <Area type="monotone" dataKey="sent" stackId="1" stroke="#8884d8" fill="#8884d8" />
              <Area type="monotone" dataKey="failed" stackId="1" stroke="#ff7c7c" fill="#ff7c7c" />
            </AreaChart>
          </ResponsiveContainer>
        </Paper>

        <Paper p="md" withBorder>
          <Title order={4} mb="md">Performance Metrics</Title>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <ChartTooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="avgResponseTime"
                stroke="#8884d8"
                name="Avg Response Time (ms)"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="errorRate"
                stroke="#ff7c7c"
                name="Error Rate (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      </SimpleGrid>

      {/* Queue Metrics */}
      <Paper p="md" withBorder>
        <Title order={4} mb="md">Queue Processing Metrics</Title>
        <SimpleGrid cols={4}>
          <Stack gap="xs">
            <Text size="xs" c="dimmed" fw={500}>Queue Size</Text>
            <Text size="lg" fw={700}>
              {workerStatus?.workers.queue.queue.size || 0}
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text size="xs" c="dimmed" fw={500}>Processing</Text>
            <Text size="lg" fw={700}>
              {workerStatus?.workers.queue.queue.processing || 0}
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text size="xs" c="dimmed" fw={500}>Failed</Text>
            <Text size="lg" fw={700} c="red">
              {workerStatus?.workers.queue.queue.failed || 0}
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text size="xs" c="dimmed" fw={500}>Throughput</Text>
            <Text size="lg" fw={700}>
              {workerStatus?.workers.queue.throughput.messagesPerMinute || 0}/min
            </Text>
          </Stack>
        </SimpleGrid>
      </Paper>
    </Stack>
  );
}