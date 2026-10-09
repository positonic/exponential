'use client';

import { useMemo } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { Card, Group, Stack, Text } from '@mantine/core';
import { IconActivity, IconHourglassLow } from '@tabler/icons-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '~/trpc/react';
import { formatHours } from './format';
import { StatCard } from './StatCard';
import { SizeCalibrationCard } from './SizeCalibrationCard';
import { useWorkspace } from '~/providers/WorkspaceProvider';

/**
 * The headline tier of the Metrics page: how much finishes per week and how
 * long a ticket takes once started, over the trailing 12 weeks. Both numbers
 * come from the activity event log, so they need neither cycles nor points —
 * see `deliveryFlow.ts` (shared with the product Overview) and ADR-0047.
 */
export function DeliveryFlowSection({
  workspaceId,
  memberIds,
}: {
  workspaceId: string | null;
  memberIds: string[];
}) {
  const { workspace } = useWorkspace();
  const { data, isLoading } = api.sprintAnalytics.getDeliveryFlow.useQuery(
    {
      workspaceId: workspaceId ?? '',
      memberIds: memberIds.length > 0 ? memberIds : undefined,
    },
    { enabled: !!workspaceId, placeholderData: keepPreviousData },
  );

  const chartData = useMemo(
    () =>
      (data?.throughput ?? []).map((w) => ({
        week: formatWeek(new Date(w.weekStart)),
        completed: w.completed,
      })),
    [data],
  );

  if (isLoading || !workspaceId || !data) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/4 rounded bg-surface-hover" />
          <div className="h-40 rounded bg-surface-hover" />
        </div>
      </Card>
    );
  }

  const p50 = data.cycleTime.p50Hours != null ? formatHours(data.cycleTime.p50Hours) : null;
  const p85 = data.cycleTime.p85Hours != null ? formatHours(data.cycleTime.p85Hours) : null;
  const fallbackDated = data.completedInWindow - data.datedByEvents;

  return (
    <Stack gap="md">
      <div>
        <Text fw={600} size="lg" className="text-text-primary">
          Delivery flow
        </Text>
        <Text size="sm" className="text-text-secondary">
          Last {data.weeks} weeks, every ticket in the workspace
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          icon={<IconActivity size={16} className="text-text-muted" />}
          label="Throughput"
          value={formatRate(data.recentWeeklyAverage)}
          valueSuffix="tickets / week"
          hint={`${data.completedInWindow} completed in the last ${data.weeks} weeks · average of the last 4`}
        />

        <StatCard
          icon={<IconHourglassLow size={16} className="text-text-muted" />}
          label="Cycle time"
          value={p50 ? `${p50.value}${p50.unit}` : '—'}
          valueSuffix={p50 ? 'median, started → done' : undefined}
          hint={
            p50 && p85
              ? `85% finish within ${p85.value}${p85.unit} · ${data.cycleTime.sampleSize} ${
                  data.cycleTime.sampleSize === 1 ? 'ticket' : 'tickets'
                } with a recorded start`
              : `Needs at least 3 completed tickets with a recorded start (have ${data.cycleTime.sampleSize})`
          }
        />
      </div>

      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        <Stack gap="md">
          <Group gap="xs">
            <IconActivity size={16} className="text-text-muted" />
            <Text size="sm" fw={500} className="text-text-secondary">
              Completed per week
            </Text>
            <Text size="xs" className="text-text-muted">
              (oldest → newest)
            </Text>
          </Group>

          {data.completedInWindow === 0 ? (
            <Text size="sm" className="text-text-muted">
              Nothing finished in the last {data.weeks} weeks — the chart appears
              once tickets reach Done.
            </Text>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                <CartesianGrid
                  strokeDasharray="2 2"
                  stroke="var(--color-border-secondary)"
                  vertical={false}
                />
                <XAxis
                  dataKey="week"
                  stroke="var(--color-text-muted)"
                  fontSize={11}
                  interval="preserveStartEnd"
                  minTickGap={8}
                />
                <YAxis
                  stroke="var(--color-text-muted)"
                  fontSize={11}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-hover)' }}
                  content={({
                    active,
                    payload,
                  }: {
                    active?: boolean;
                    payload?: Array<{ payload: (typeof chartData)[number] }>;
                  }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload;
                    if (!row) return null;
                    return (
                      <div className="rounded-md border border-border-primary bg-surface-primary p-3 shadow-lg">
                        <Text size="xs" fw={600} className="mb-1 text-text-primary">
                          Week of {row.week}
                        </Text>
                        <Text size="xs" className="text-text-secondary">
                          {row.completed} {row.completed === 1 ? 'ticket' : 'tickets'} completed
                        </Text>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="completed"
                  name="Completed"
                  fill="var(--color-brand-primary)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}

          {fallbackDated > 0 && (
            <Text size="xs" className="text-text-muted">
              {fallbackDated} of these {fallbackDated === 1 ? 'has' : 'have'} no
              status event and {fallbackDated === 1 ? 'is' : 'are'} dated by
              their last save instead.
            </Text>
          )}
        </Stack>
      </Card>

      {data.sizes && workspace && (
        <SizeCalibrationCard sizes={data.sizes} workspaceSlug={workspace.slug} />
      )}
    </Stack>
  );
}

function formatWeek(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "7.3" / "12" — one decimal unless the rate is whole. */
function formatRate(perWeek: number): string {
  return Number.isInteger(perWeek) ? String(perWeek) : perWeek.toFixed(1);
}
