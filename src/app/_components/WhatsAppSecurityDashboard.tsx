'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  Table,
  Text,
  Badge,
  Group,
  Select,
  ScrollArea,
  Alert,
  LoadingOverlay,
  Card,
  SimpleGrid,
  Progress,
  List,
  ThemeIcon,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconShieldCheck,
  IconAlertTriangle,
  IconBan,
  IconClock,
  IconRefresh,
  IconFileText,
  IconExclamationCircle,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatDistanceToNow } from 'date-fns';

interface WhatsAppSecurityDashboardProps {
  integrationId: string;
  opened: boolean;
  onClose: () => void;
}

const severityColors = {
  low: 'blue',
  medium: 'yellow',
  high: 'orange',
  critical: 'red',
} as const;

const severityIcons = {
  low: IconShieldCheck,
  medium: IconAlertTriangle,
  high: IconExclamationCircle,
  critical: IconBan,
} as const;

export function WhatsAppSecurityDashboard({ 
  integrationId, 
  opened, 
  onClose 
}: WhatsAppSecurityDashboardProps) {
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    new Date(),
  ]);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null);

  // Get security report
  const { data: report, isLoading, refetch } = api.integration.getWhatsAppSecurityReport.useQuery(
    {
      integrationId,
      startDate: dateRange[0] || undefined,
      endDate: dateRange[1] || undefined,
    },
    { 
      enabled: opened && !!dateRange[0] && !!dateRange[1],
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  // Get recent events
  const { data: events } = api.integration.getWhatsAppSecurityEvents.useQuery(
    {
      integrationId,
      severity: severityFilter || undefined,
      eventType: eventTypeFilter || undefined,
      limit: 50,
    },
    { enabled: opened }
  );

  const totalEvents = report?.summary 
    ? Object.values(report.summary).reduce((sum, count) => sum + count, 0)
    : 0;

  const criticalCount = report?.criticalEvents?.length || 0;
  const criticalPercentage = totalEvents > 0 ? (criticalCount / totalEvents) * 100 : 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="WhatsApp Security Dashboard"
      size="xl"
    >
      <Stack gap="lg">
        <Group justify="space-between">
          <DatePickerInput
            type="range"
            label="Date Range"
            placeholder="Select date range"
            value={dateRange}
            onChange={setDateRange}
            style={{ flex: 1 }}
          />
          <ActionIcon 
            variant="light" 
            onClick={() => refetch()}
            loading={isLoading}
            mt="xl"
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>

        <LoadingOverlay visible={isLoading} />

        {report && (
          <>
            <SimpleGrid cols={4}>
              <Card p="md" withBorder>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Events
                </Text>
                <Text size="xl" fw={700}>{totalEvents}</Text>
              </Card>

              <Card p="md" withBorder>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Critical Events
                </Text>
                <Group gap="xs">
                  <Text size="xl" fw={700} c={criticalCount > 0 ? 'red' : 'green'}>
                    {criticalCount}
                  </Text>
                  {totalEvents > 0 && (
                    <Badge color={criticalCount > 0 ? 'red' : 'green'} size="sm">
                      {criticalPercentage.toFixed(1)}%
                    </Badge>
                  )}
                </Group>
              </Card>

              <Card p="md" withBorder>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Top Risk
                </Text>
                <Text size="sm" fw={500} lineClamp={2}>
                  {report.topPhoneNumbers[0]?.phoneNumber || 'No data'}
                </Text>
              </Card>

              <Card p="md" withBorder>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Health Score
                </Text>
                <Progress
                  value={100 - criticalPercentage}
                  color={criticalPercentage > 10 ? 'red' : criticalPercentage > 5 ? 'yellow' : 'green'}
                  size="lg"
                  mt="xs"
                />
              </Card>
            </SimpleGrid>

            {report.recommendations.length > 0 && (
              <Card withBorder p="md">
                <Group mb="sm">
                  <IconFileText size={20} />
                  <Text fw={600}>Security Recommendations</Text>
                </Group>
                <List spacing="xs" size="sm">
                  {report.recommendations.map((rec, index) => (
                    <List.Item
                      key={index}
                      icon={
                        <ThemeIcon color="blue" size={24} radius="xl">
                          <IconShieldCheck size={16} />
                        </ThemeIcon>
                      }
                    >
                      {rec}
                    </List.Item>
                  ))}
                </List>
              </Card>
            )}

            {report.criticalEvents.length > 0 && (
              <Alert
                icon={<IconBan size={16} />}
                title="Critical Security Events"
                color="red"
              >
                {report.criticalEvents.length} critical events detected in the selected time period.
                Review them immediately below.
              </Alert>
            )}

            <Card withBorder p="md">
              <Group mb="md" justify="space-between">
                <Text fw={600}>Recent Security Events</Text>
                <Group gap="xs">
                  <Select
                    placeholder="Filter by severity"
                    data={[
                      { value: '', label: 'All Severities' },
                      { value: 'low', label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' },
                      { value: 'critical', label: 'Critical' },
                    ]}
                    value={severityFilter}
                    onChange={setSeverityFilter}
                    clearable
                    style={{ width: 150 }}
                  />
                  <Select
                    placeholder="Filter by type"
                    data={[
                      { value: '', label: 'All Types' },
                      { value: 'UNAUTHORIZED_ACCESS', label: 'Unauthorized Access' },
                      { value: 'PERMISSION_DENIED', label: 'Permission Denied' },
                      { value: 'SUSPICIOUS_MESSAGE_PATTERN', label: 'Suspicious Message' },
                      { value: 'RATE_LIMIT_EXCEEDED', label: 'Rate Limit' },
                      { value: 'INVALID_API_KEY', label: 'Invalid API Key' },
                    ]}
                    value={eventTypeFilter}
                    onChange={setEventTypeFilter}
                    clearable
                    style={{ width: 180 }}
                  />
                </Group>
              </Group>

              <ScrollArea h={300}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Time</Table.Th>
                      <Table.Th>Event Type</Table.Th>
                      <Table.Th>Severity</Table.Th>
                      <Table.Th>Details</Table.Th>
                      <Table.Th></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {events?.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={5}>
                          <Text c="dimmed" ta="center" py="md">
                            No security events found
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      events?.map((event) => {
                        const Icon = severityIcons[event.severity];
                        return (
                          <Table.Tr key={event.id}>
                            <Table.Td>
                              <Group gap="xs">
                                <IconClock size={14} />
                                <Text size="sm">
                                  {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={500}>
                                {event.eventType.replace(/_/g, ' ')}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge 
                                color={severityColors[event.severity]} 
                                variant="light"
                                leftSection={<Icon size={12} />}
                              >
                                {event.severity}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" lineClamp={2}>
                                {event.metadata.phoneNumber && `Phone: ${event.metadata.phoneNumber}`}
                                {event.metadata.reason && ` - ${event.metadata.reason}`}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Tooltip label="View details">
                                <ActionIcon variant="light" size="sm">
                                  <IconFileText size={14} />
                                </ActionIcon>
                              </Tooltip>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Card>
          </>
        )}
      </Stack>
    </Modal>
  );
}