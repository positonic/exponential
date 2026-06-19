'use client';

import {
  Title,
  Text,
  Button,
  Card,
  Badge,
  Group,
  Stack,
  Loader,
  Box,
  ThemeIcon,
  Divider,
} from '@mantine/core';
import { IconBolt, IconRefresh } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

function statusColor(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'green';
    case 'FAILED':
      return 'red';
    case 'RUNNING':
      return 'blue';
    default:
      return 'gray';
  }
}

function targetTypeOf(config: unknown): string {
  if (config && typeof config === 'object' && 'targetCustomerType' in config) {
    const value = (config as Record<string, unknown>).targetCustomerType;
    if (typeof value === 'string') return value;
  }
  return '—';
}

export default function CrmAutomationsPage() {
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const utils = api.useUtils();

  const enabled = !!workspaceId;
  const automationsQuery = api.crmAutomation.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled },
  );
  const runsQuery = api.crmAutomation.listRuns.useQuery(
    { workspaceId: workspaceId ?? '', limit: 20 },
    { enabled },
  );

  const seed = api.crmAutomation.seedDefaults.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Automations seeded',
        message:
          'Channel Partner and Advisor onboarding automations are ready.',
        color: 'green',
      });
      void utils.crmAutomation.list.invalidate();
      void utils.crmAutomation.listRuns.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Seeding failed',
        message: error.message,
        color: 'red',
      });
    },
  });

  if (wsLoading || !workspaceId) {
    return <Loader />;
  }

  const automations = automationsQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={2}>Automations</Title>
          <Text c="dimmed" size="sm">
            Onboarding automations run when a contact&apos;s Customer type is set
            to Channel Partner or Advisor.
          </Text>
        </Box>
        <Button
          leftSection={<IconRefresh size={16} />}
          onClick={() => seed.mutate({ workspaceId })}
          loading={seed.isPending}
        >
          {automations.length > 0
            ? 'Re-seed automations'
            : 'Seed onboarding automations'}
        </Button>
      </Group>

      {automationsQuery.isLoading ? (
        <Loader />
      ) : automations.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center" gap="sm">
            <ThemeIcon size="xl" variant="light">
              <IconBolt />
            </ThemeIcon>
            <Text fw={600}>No automations yet</Text>
            <Text c="dimmed" size="sm" ta="center">
              Seed the onboarding automations, then add a contact with a Channel
              Partner or Advisor Customer type to trigger one.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {automations.map((automation) => (
            <Card key={automation.id} withBorder padding="md">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Group gap="xs">
                    <Text fw={600}>{automation.name}</Text>
                    <Badge variant="light">
                      {targetTypeOf(automation.config)}
                    </Badge>
                    {!automation.isActive && (
                      <Badge color="gray" variant="light">
                        inactive
                      </Badge>
                    )}
                  </Group>
                  <Text c="dimmed" size="sm" mt={4}>
                    {automation.steps.map((step) => step.label).join('  →  ')}
                  </Text>
                </Box>
                <Badge variant="outline">
                  {automation._count.runs}{' '}
                  {automation._count.runs === 1 ? 'run' : 'runs'}
                </Badge>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Divider label="Recent runs" labelPosition="left" />

      {runsQuery.isLoading ? (
        <Loader />
      ) : runs.length === 0 ? (
        <Text c="dimmed" size="sm">
          No runs yet. Add a contact with a Channel Partner or Advisor Customer
          type to trigger one.
        </Text>
      ) : (
        <Stack gap="xs">
          {runs.map((run) => (
            <Card key={run.id} withBorder padding="sm">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Group gap="xs">
                    <Text fw={500} size="sm">
                      {run.definition.name}
                    </Text>
                    <Badge
                      size="sm"
                      color={statusColor(run.status)}
                      variant="light"
                    >
                      {run.status}
                    </Badge>
                  </Group>
                  <Text c="dimmed" size="xs" mt={2}>
                    {new Date(run.startedAt).toLocaleString()}
                  </Text>
                </Box>
                <Group gap={6}>
                  {run.stepRuns.map((step) => (
                    <Badge
                      key={step.id}
                      size="xs"
                      color={statusColor(step.status)}
                      variant="dot"
                    >
                      {step.status}
                    </Badge>
                  ))}
                </Group>
              </Group>
              {run.errorMessage ? (
                <Text c="red" size="xs" mt={4}>
                  {run.errorMessage}
                </Text>
              ) : null}
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
