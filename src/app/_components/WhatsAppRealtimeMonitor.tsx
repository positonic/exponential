'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Card,
  SimpleGrid,
  Text,
  Title,
  Badge,
  Group,
  Stack,
  Paper,
  Progress,
  ScrollArea,
  Timeline,
  Alert,
  ThemeIcon,
  RingProgress,
  Center,
  Indicator,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconActivity,
  IconMessage,
  IconMessageCircle,
  IconAlertCircle,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconTrendingUp,
  IconTrendingDown,
  IconRefresh,
  IconBell,
  IconBellOff,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatDistanceToNow } from 'date-fns';
import { notifications } from '@mantine/notifications';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface WhatsAppRealtimeMonitorProps {
  integrationId: string;
  refreshInterval?: number;
}

interface MessageEvent {
  id: string;
  type: 'sent' | 'received' | 'delivered' | 'read' | 'failed';
  phoneNumber: string;
  timestamp: Date;
  message?: string;
}

interface SystemAlert {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  timestamp: Date;
}

export function WhatsAppRealtimeMonitor({ 
  integrationId,
  refreshInterval = 5000 // 5 seconds default
}: WhatsAppRealtimeMonitorProps) {
  const [messageEvents, setMessageEvents] = useState<MessageEvent[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
  const [activeConversations, setActiveConversations] = useState(0);
  const [messagesPerMinute, setMessagesPerMinute] = useState(0);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [isConnected] = useState(true);
  const [performanceHistory, setPerformanceHistory] = useState<{
    mpm: number[];
    responseTime: number[];
    queueSize: number[];
    errorRate: number[];
  }>({
    mpm: Array(20).fill(0),
    responseTime: Array(20).fill(0),
    queueSize: Array(20).fill(0),
    errorRate: Array(20).fill(0),
  });

  // Get real-time data via polling (WebSocket alternative)
  const { data: health, refetch: refetchHealth } = api.integration.getWhatsAppHealth.useQuery(
    { integrationId },
    {
      enabled: !!integrationId,
      refetchInterval: refreshInterval,
      refetchIntervalInBackground: true,
    }
  );

  const { data: workerStatus, refetch: refetchWorker } = api.integration.getWhatsAppWorkerStatus.useQuery(
    { integrationId },
    {
      enabled: !!integrationId,
      refetchInterval: refreshInterval,
      refetchIntervalInBackground: true,
    }
  );

  // Simulate real-time message events (in production, use WebSocket or SSE)
  useEffect(() => {
    const interval = setInterval(() => {
      // Update messages per minute based on worker throughput
      if (workerStatus?.workers.queue.throughput.messagesPerMinute) {
        const newMPM = workerStatus.workers.queue.throughput.messagesPerMinute;
        setMessagesPerMinute(newMPM);
        
        // Update performance history
        setPerformanceHistory(prev => ({
          mpm: [...prev.mpm.slice(1), newMPM],
          responseTime: [...prev.responseTime.slice(1), workerStatus.workers.queue.throughput.avgProcessingTime || 0],
          queueSize: [...prev.queueSize.slice(1), workerStatus.workers.queue.queue.size || 0],
          errorRate: [...prev.errorRate.slice(1), (health?.checks?.errorRate?.rate || 0) * 100],
        }));
      }

      // Simulate active conversations
      const queueSize = workerStatus?.workers.queue.queue.size || 0;
      const processing = workerStatus?.workers.queue.queue.processing || 0;
      setActiveConversations(queueSize + processing);

      // Check for system alerts
      if (health?.status === 'unhealthy' || health?.status === 'degraded') {
        const newAlert: SystemAlert = {
          id: Date.now().toString(),
          type: health.status === 'unhealthy' ? 'error' : 'warning',
          message: `System ${health.status}: ${getHealthMessage(health)}`,
          timestamp: new Date(),
        };
        
        setSystemAlerts(prev => [newAlert, ...prev].slice(0, 10));
        
        if (alertsEnabled) {
          notifications.show({
            title: 'System Alert',
            message: newAlert.message,
            color: newAlert.type === 'error' ? 'red' : 'yellow',
            icon: <IconAlertCircle />,
          });
        }
      }

      // Simulate message events
      if (Math.random() > 0.7 && workerStatus?.workers.queue.queue.processing > 0) {
        const types: MessageEvent['type'][] = ['sent', 'received', 'delivered', 'read', 'failed'];
        const randomType = types[Math.floor(Math.random() * types.length)] ?? 'sent';
        const newEvent: MessageEvent = {
          id: Date.now().toString(),
          type: randomType,
          phoneNumber: `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
          timestamp: new Date(),
        };
        
        setMessageEvents(prev => [newEvent, ...prev].slice(0, 20));
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [workerStatus, health, alertsEnabled]);

  // Calculate trend
  const previousMPM = useRef(messagesPerMinute);
  const trend = messagesPerMinute > previousMPM.current ? 'up' : 
                messagesPerMinute < previousMPM.current ? 'down' : 'stable';

  useEffect(() => {
    previousMPM.current = messagesPerMinute;
  }, [messagesPerMinute]);

  const getHealthMessage = (healthData: any) => {
    const issues = [];
    if (healthData?.checks?.database?.status === 'error') issues.push('Database');
    if (healthData?.checks?.circuitBreakers?.status === 'error') issues.push('Circuit Breakers');
    if (healthData?.checks?.errorRate?.status === 'error') issues.push('High Error Rate');
    return issues.length > 0 ? `Issues with: ${issues.join(', ')}` : 'System degraded';
  };

  const getEventIcon = (type: MessageEvent['type']) => {
    switch (type) {
      case 'sent': return <IconMessageCircle size={16} />;
      case 'received': return <IconMessage size={16} />;
      case 'delivered': return <IconCircleCheck size={16} />;
      case 'read': return <IconCircleCheck size={16} style={{ fill: 'currentColor' }} />;
      case 'failed': return <IconCircleX size={16} />;
    }
  };

  const getEventColor = (type: MessageEvent['type']) => {
    switch (type) {
      case 'sent': return 'blue';
      case 'received': return 'green';
      case 'delivered': return 'cyan';
      case 'read': return 'teal';
      case 'failed': return 'red';
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Real-Time Monitor</Title>
        <Group>
          <Indicator processing disabled={!isConnected} color={isConnected ? 'green' : 'red'}>
            <Badge color={isConnected ? 'green' : 'red'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </Indicator>
          <Tooltip label={alertsEnabled ? 'Disable alerts' : 'Enable alerts'}>
            <ActionIcon
              variant="light"
              onClick={() => setAlertsEnabled(!alertsEnabled)}
              color={alertsEnabled ? 'blue' : 'gray'}
            >
              {alertsEnabled ? <IconBell size={18} /> : <IconBellOff size={18} />}
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            variant="light"
            onClick={() => {
              void refetchHealth();
              void refetchWorker();
            }}
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Live Metrics */}
      <SimpleGrid cols={4}>
        <Card>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Active Conversations
              </Text>
              <IconActivity size={16} />
            </Group>
            <Text size="xl" fw={700}>
              {activeConversations}
            </Text>
            <Progress
              value={(activeConversations / 100) * 100}
              color="blue"
              size="xs"
              animated
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Messages/Min
              </Text>
              {trend === 'up' ? (
                <IconTrendingUp size={16} color="green" />
              ) : trend === 'down' ? (
                <IconTrendingDown size={16} color="red" />
              ) : (
                <IconActivity size={16} />
              )}
            </Group>
            <Text size="xl" fw={700}>
              {messagesPerMinute.toFixed(1)}
            </Text>
            <Badge size="xs" color={trend === 'up' ? 'green' : trend === 'down' ? 'red' : 'gray'}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} 
              {trend !== 'stable' && ` ${Math.abs(messagesPerMinute - previousMPM.current).toFixed(1)}`}
            </Badge>
          </Stack>
        </Card>

        <Card>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Queue Status
              </Text>
              <IconClock size={16} />
            </Group>
            <Group>
              <RingProgress
                size={60}
                thickness={6}
                sections={[
                  {
                    value: workerStatus?.workers.queue.queue.processing || 0,
                    color: 'blue',
                    tooltip: 'Processing',
                  },
                  {
                    value: workerStatus?.workers.queue.queue.size || 0,
                    color: 'yellow',
                    tooltip: 'Queued',
                  },
                  {
                    value: workerStatus?.workers.queue.queue.failed || 0,
                    color: 'red',
                    tooltip: 'Failed',
                  },
                ]}
              />
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  {workerStatus?.workers.queue.queue.processing || 0} processing
                </Text>
                <Text size="xs" c="dimmed">
                  {workerStatus?.workers.queue.queue.size || 0} queued
                </Text>
              </Stack>
            </Group>
          </Stack>
        </Card>

        <Card>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                System Health
              </Text>
              <ThemeIcon
                color={
                  health?.status === 'healthy' ? 'green' :
                  health?.status === 'degraded' ? 'yellow' : 'red'
                }
                variant="light"
                size="sm"
              >
                <IconActivity size={14} />
              </ThemeIcon>
            </Group>
            <Badge
              size="lg"
              color={
                health?.status === 'healthy' ? 'green' :
                health?.status === 'degraded' ? 'yellow' : 'red'
              }
              fullWidth
            >
              {health?.status || 'Unknown'}
            </Badge>
            <Text size="xs" c="dimmed">
              Error rate: {health?.checks?.errorRate?.rate 
                ? `${(health.checks.errorRate.rate * 100).toFixed(2)}%` 
                : 'N/A'}
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={2}>
        {/* Message Flow */}
        <Paper p="md" withBorder>
          <Stack>
            <Group justify="space-between">
              <Title order={4}>Message Flow</Title>
              <Badge size="xs">{messageEvents.length} events</Badge>
            </Group>
            <ScrollArea h={300}>
              <Timeline active={messageEvents.length} bulletSize={20} lineWidth={2}>
                {messageEvents.map((event) => (
                  <Timeline.Item
                    key={event.id}
                    bullet={getEventIcon(event.type)}
                    color={getEventColor(event.type)}
                    title={
                      <Group gap="xs">
                        <Badge size="xs" color={getEventColor(event.type)}>
                          {event.type}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                        </Text>
                      </Group>
                    }
                  >
                    <Text size="xs" c="dimmed">
                      {event.phoneNumber}
                    </Text>
                  </Timeline.Item>
                ))}
                {messageEvents.length === 0 && (
                  <Center h={100}>
                    <Text c="dimmed">No recent message events</Text>
                  </Center>
                )}
              </Timeline>
            </ScrollArea>
          </Stack>
        </Paper>

        {/* System Alerts */}
        <Paper p="md" withBorder>
          <Stack>
            <Group justify="space-between">
              <Title order={4}>System Alerts</Title>
              <Badge size="xs" color={systemAlerts.length > 0 ? 'red' : 'green'}>
                {systemAlerts.length} active
              </Badge>
            </Group>
            <ScrollArea h={300}>
              <Stack gap="xs">
                {systemAlerts.map((alert) => (
                  <Alert
                    key={alert.id}
                    color={alert.type === 'error' ? 'red' : alert.type === 'warning' ? 'yellow' : 'blue'}
                    title={formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                    icon={<IconAlertCircle />}
                  >
                    {alert.message}
                  </Alert>
                ))}
                {systemAlerts.length === 0 && (
                  <Alert color="green" icon={<IconCircleCheck />}>
                    No active alerts - System running smoothly
                  </Alert>
                )}
              </Stack>
            </ScrollArea>
          </Stack>
        </Paper>
      </SimpleGrid>

      {/* Performance Indicators with Sparklines */}
      <Paper p="md" withBorder>
        <Title order={4} mb="md">Performance Trends</Title>
        <SimpleGrid cols={4}>
          <Card>
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={500}>Messages/Min</Text>
              <Text size="lg" fw={700}>{messagesPerMinute.toFixed(1)}</Text>
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={performanceHistory.mpm.map((v, i) => ({ i, v }))}>
                  <Line 
                    type="monotone" 
                    dataKey="v" 
                    stroke="var(--color-brand-primary)" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Stack>
          </Card>

          <Card>
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={500}>Response Time</Text>
              <Text size="lg" fw={700}>{workerStatus?.workers.queue.throughput.avgProcessingTime || 0}ms</Text>
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={performanceHistory.responseTime.map((v, i) => ({ i, v }))}>
                  <Line 
                    type="monotone" 
                    dataKey="v" 
                    stroke="var(--color-brand-success)" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Stack>
          </Card>

          <Card>
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={500}>Queue Size</Text>
              <Text size="lg" fw={700}>{workerStatus?.workers.queue.queue.size || 0}</Text>
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={performanceHistory.queueSize.map((v, i) => ({ i, v }))}>
                  <Line 
                    type="monotone" 
                    dataKey="v" 
                    stroke="var(--color-brand-warning)" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Stack>
          </Card>

          <Card>
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={500}>Error Rate</Text>
              <Text size="lg" fw={700}>{(health?.checks?.errorRate?.rate * 100 || 0).toFixed(2)}%</Text>
              <ResponsiveContainer width="100%" height={40}>
                <LineChart data={performanceHistory.errorRate.map((v, i) => ({ i, v }))}>
                  <Line 
                    type="monotone" 
                    dataKey="v" 
                    stroke="var(--color-brand-error)" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Stack>
          </Card>
        </SimpleGrid>

        <SimpleGrid cols={4} mt="md">
          <Stack gap="xs" align="center">
            <Text size="xs" c="dimmed">Cache Hit Rate</Text>
            <Text fw={600}>{(workerStatus?.performance.cacheMetrics.hitRate * 100 || 0).toFixed(1)}%</Text>
          </Stack>
          <Stack gap="xs" align="center">
            <Text size="xs" c="dimmed">Failed Messages</Text>
            <Text fw={600} c="red">{workerStatus?.workers.queue.queue.failed || 0}</Text>
          </Stack>
          <Stack gap="xs" align="center">
            <Text size="xs" c="dimmed">Memory Usage</Text>
            <Text fw={600}>{workerStatus?.performance.memoryUsage.percentage || 0}%</Text>
          </Stack>
          <Stack gap="xs" align="center">
            <Text size="xs" c="dimmed">Worker Status</Text>
            <Badge color={workerStatus?.status === 'active' ? 'green' : 'yellow'}>
              {workerStatus?.status || 'Unknown'}
            </Badge>
          </Stack>
        </SimpleGrid>
      </Paper>
    </Stack>
  );
}