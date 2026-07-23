'use client';

import { Card, Text, Group, Stack, Progress, Container } from '@mantine/core';
import { IconChartBar, IconCircleCheck, IconBolt } from '@tabler/icons-react';
import { api, type RouterOutputs } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

/**
 * Metrics page dashboard (v1 tracer bullet).
 *
 * Renders the workspace's ACTIVE cycle: velocity (completed-action **count** as
 * the headline, summed effort/points alongside) and completion. All numbers are
 * computed live by `sprintAnalytics.getActiveCycleMetrics` — nothing is read
 * from the dormant `SprintMetrics` table. See ADR-0047.
 *
 * Trend across cycles (#2) and merged-PR turnaround (#3) are out of scope here.
 */
export function MetricsDashboard() {
  const { workspace, workspaceId } = useWorkspace();

  const { data, isLoading } = api.sprintAnalytics.getActiveCycleMetrics.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  return (
    <Container size="lg" className="w-full py-6">
      <Stack gap="lg">
        <Group gap="sm">
          <IconChartBar size={24} className="text-text-secondary" />
          <div>
            <Text fw={600} size="xl" className="text-text-primary">
              Metrics
            </Text>
            <Text size="sm" className="text-text-secondary">
              {workspace?.name
                ? `Delivery metrics for ${workspace.name}`
                : 'Delivery metrics'}
            </Text>
          </div>
        </Group>

        {isLoading || !workspaceId ? (
          <LoadingState />
        ) : !data ? (
          <EmptyState />
        ) : (
          <ActiveCycleMetrics data={data} />
        )}
      </Stack>
    </Container>
  );
}

type CycleMetrics = NonNullable<
  RouterOutputs['sprintAnalytics']['getActiveCycleMetrics']
>;

function ActiveCycleMetrics({ data }: { data: CycleMetrics }) {
  const completionRate = Math.round(data.completionRate);

  return (
    <Stack gap="md">
      <Text size="sm" className="text-text-muted">
        Active cycle:{' '}
        <span className="text-text-secondary font-medium">{data.sprintName}</span>
      </Text>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Velocity — completed-action COUNT is the headline, points alongside */}
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Stack gap="xs">
            <Group gap="xs">
              <IconBolt size={16} className="text-text-muted" />
              <Text size="sm" fw={500} className="text-text-secondary">
                Velocity
              </Text>
            </Group>
            <Group align="baseline" gap="xs">
              <Text className="text-4xl font-bold text-accent-indigo">
                {data.completedActions}
              </Text>
              <Text size="sm" className="text-text-muted">
                {data.completedActions === 1 ? 'action' : 'actions'} completed
              </Text>
            </Group>
            <Text size="xs" className="text-text-muted">
              {data.completedEffort} of {data.plannedEffort + data.completedEffort}{' '}
              points delivered
            </Text>
          </Stack>
        </Card>

        {/* Completion */}
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Stack gap="xs">
            <Group gap="xs">
              <IconCircleCheck size={16} className="text-text-muted" />
              <Text size="sm" fw={500} className="text-text-secondary">
                Completion
              </Text>
            </Group>
            <Group align="baseline" gap="xs">
              <Text className="text-4xl font-bold text-accent-indigo">
                {completionRate}%
              </Text>
              <Text size="sm" className="text-text-muted">
                {data.completedActions}/{data.plannedActions} planned
              </Text>
            </Group>
            <Progress
              value={completionRate}
              size="sm"
              radius="xl"
              color={completionRate >= 100 ? 'green' : 'indigo'}
            />
          </Stack>
        </Card>
      </div>
    </Stack>
  );
}

function EmptyState() {
  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="xs" align="center" className="py-10 text-center">
        <IconChartBar size={32} className="text-text-muted" />
        <Text fw={500} className="text-text-primary">
          No active cycle
        </Text>
        <Text size="sm" className="text-text-secondary">
          Start a cycle to see live velocity and completion metrics here.
        </Text>
      </Stack>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[0, 1].map((i) => (
        <Card
          key={i}
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-surface-hover" />
            <div className="h-10 w-1/2 rounded bg-surface-hover" />
            <div className="h-3 w-2/3 rounded bg-surface-hover" />
          </div>
        </Card>
      ))}
    </div>
  );
}
