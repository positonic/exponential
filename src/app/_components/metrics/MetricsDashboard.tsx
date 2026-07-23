'use client';

import { Card, Text, Group, Stack, Progress, Container } from '@mantine/core';
import {
  IconChartBar,
  IconCircleCheck,
  IconBolt,
  IconTrendingUp,
  IconGitPullRequest,
} from '@tabler/icons-react';
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

        <VelocityTrend workspaceId={workspaceId} />
      </Stack>
    </Container>
  );
}

function VelocityTrend({ workspaceId }: { workspaceId: string | null }) {
  const { data, isLoading } = api.sprintAnalytics.getVelocityTrend.useQuery(
    { workspaceId: workspaceId ?? '', count: 8 },
    { enabled: !!workspaceId },
  );

  if (isLoading || !workspaceId) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/4 rounded bg-surface-hover" />
          <div className="h-24 rounded bg-surface-hover" />
        </div>
      </Card>
    );
  }

  // Trend needs at least 2 completed cycles to be meaningful.
  if (!data || data.length < 2) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        <Group gap="xs" className="mb-2">
          <IconTrendingUp size={16} className="text-text-muted" />
          <Text size="sm" fw={500} className="text-text-secondary">
            Velocity trend
          </Text>
        </Group>
        <Text size="sm" className="text-text-muted">
          Not enough completed cycles yet — the trend appears once at least two
          cycles have completed.
        </Text>
      </Card>
    );
  }

  // Service returns most-recent-first; show oldest → newest for a trend read.
  const cycles = [...data].reverse();
  const maxTickets = Math.max(...cycles.map((c) => c.completedTickets), 1);

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="md">
        <Group gap="xs">
          <IconTrendingUp size={16} className="text-text-muted" />
          <Text size="sm" fw={500} className="text-text-secondary">
            Velocity trend
          </Text>
          <Text size="xs" className="text-text-muted">
            (last {cycles.length} completed cycles)
          </Text>
        </Group>

        <Stack gap="sm">
          {cycles.map((cycle) => (
            <div key={cycle.cycleId}>
              <Group justify="space-between" gap="xs" className="mb-1">
                <Text size="xs" className="truncate text-text-secondary">
                  {cycle.cycleName}
                </Text>
                <Text size="xs" className="text-text-muted">
                  <span className="font-semibold text-text-primary">
                    {cycle.completedTickets}
                  </span>{' '}
                  {cycle.completedTickets === 1 ? 'ticket' : 'tickets'} ·{' '}
                  {cycle.completedPoints} pts
                </Text>
              </Group>
              <Progress
                value={(cycle.completedTickets / maxTickets) * 100}
                size="lg"
                radius="sm"
                color="indigo"
              />
            </div>
          ))}
        </Stack>
      </Stack>
    </Card>
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
        <span className="text-text-secondary font-medium">{data.cycleName}</span>
      </Text>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Velocity — completed-ticket COUNT is the headline, points alongside */}
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
                {data.completedTickets}
              </Text>
              <Text size="sm" className="text-text-muted">
                {data.completedTickets === 1 ? 'ticket' : 'tickets'} completed
              </Text>
            </Group>
            <Text size="xs" className="text-text-muted">
              {data.completedPoints} of {data.totalPoints} points delivered
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
                {data.completedTickets}/{data.totalTickets} tickets
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

        {/* Merged-PR turnaround */}
        <PrTurnaroundCard />
      </div>
    </Stack>
  );
}

/** Format a duration in hours as a compact, sensible unit. */
function formatHours(hours: number): { value: string; unit: string } {
  if (hours < 1) return { value: String(Math.max(1, Math.round(hours * 60))), unit: 'min' };
  if (hours < 48) return { value: String(Math.round(hours)), unit: 'h' };
  return { value: (hours / 24).toFixed(1), unit: 'd' };
}

function PrTurnaroundCard() {
  const { workspaceId } = useWorkspace();
  const { data, isLoading } =
    api.sprintAnalytics.getActiveCyclePrTurnaround.useQuery(
      { workspaceId: workspaceId ?? '' },
      { enabled: !!workspaceId },
    );

  const header = (
    <Group gap="xs">
      <IconGitPullRequest size={16} className="text-text-muted" />
      <Text size="sm" fw={500} className="text-text-secondary">
        PR turnaround
      </Text>
    </Group>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="animate-pulse space-y-2">
        <div className="h-10 w-1/2 rounded bg-surface-hover" />
        <div className="h-3 w-2/3 rounded bg-surface-hover" />
      </div>
    );
  } else if (!data || data.mergedPrCount === 0) {
    body = (
      <Text size="sm" className="text-text-muted">
        No PRs merged this cycle yet.
      </Text>
    );
  } else if (data.avgHours == null) {
    // PRs merged, but no captured opened event to measure against.
    body = (
      <Stack gap="xs">
        <Text className="text-4xl font-bold text-accent-indigo">
          {data.mergedPrCount}
        </Text>
        <Text size="xs" className="text-text-muted">
          {data.mergedPrCount === 1 ? 'PR' : 'PRs'} merged · turnaround
          unavailable
        </Text>
      </Stack>
    );
  } else {
    const avg = formatHours(data.avgHours);
    body = (
      <Stack gap="xs">
        <Group align="baseline" gap={4}>
          <Text className="text-4xl font-bold text-accent-indigo">
            {avg.value}
          </Text>
          <Text size="lg" fw={600} className="text-accent-indigo">
            {avg.unit}
          </Text>
          <Text size="sm" className="text-text-muted">
            avg
          </Text>
        </Group>
        <Text size="xs" className="text-text-muted">
          {data.medianHours != null &&
            (() => {
              const med = formatHours(data.medianHours);
              return `${med.value}${med.unit} median · `;
            })()}
          {data.mergedPrCount} {data.mergedPrCount === 1 ? 'PR' : 'PRs'} merged
        </Text>
      </Stack>
    );
  }

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="xs">
        {header}
        {body}
      </Stack>
    </Card>
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
