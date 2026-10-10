'use client';

import { useMemo, useState } from 'react';
import { Group, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RouterOutputs } from '~/trpc/react';

type CyclePoint =
  RouterOutputs['sprintAnalytics']['getAllCyclesMetrics']['cycles'][number];

type SeriesKey =
  | 'completedTickets'
  | 'completedPoints'
  | 'mergedPrCount'
  | 'completionRate';

interface Series {
  key: SeriesKey;
  label: string;
  /** CSS variable — never a literal hex (see the styling architecture doc). */
  color: string;
  axis: 'left' | 'right';
}

/**
 * Counts share the left axis; completion rate gets its own 0–100 right axis so
 * a percentage can't dwarf a ticket count (or vice versa).
 */
const SERIES: Series[] = [
  {
    key: 'completedTickets',
    label: 'Tickets completed',
    color: 'var(--color-brand-primary)',
    axis: 'left',
  },
  {
    key: 'completedPoints',
    label: 'Points delivered',
    color: 'var(--accent-meetings)',
    axis: 'left',
  },
  {
    key: 'mergedPrCount',
    label: 'PRs merged',
    color: 'var(--accent-crm)',
    axis: 'left',
  },
  {
    key: 'completionRate',
    label: 'Completion %',
    color: 'var(--accent-okr)',
    axis: 'right',
  },
];

function shortName(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

function formatSeriesValue(key: SeriesKey, value: number): string {
  return key === 'completionRate' ? `${Math.round(value)}%` : String(value);
}

/**
 * Every metric plotted across every cycle, oldest → newest. Series are
 * toggleable; any series that is flat-zero across all cycles (typically
 * "PRs merged" in a workspace with no GitHub webhook data) starts hidden so it
 * doesn't read as a real trend line at the axis floor.
 */
export function CycleTrendChart({ cycles }: { cycles: CyclePoint[] }) {
  const chartData = useMemo(
    () =>
      cycles.map((c) => ({
        name: c.cycleName,
        completedTickets: c.completedTickets,
        completedPoints: c.completedPoints,
        mergedPrCount: c.mergedPrCount,
        completionRate: Math.round(c.completionRate),
        totalTickets: c.totalTickets,
      })),
    [cycles],
  );

  const defaultVisible = useMemo(() => {
    const visible = new Set<SeriesKey>();
    for (const series of SERIES) {
      if (chartData.some((row) => row[series.key] > 0)) visible.add(series.key);
    }
    return visible;
  }, [chartData]);

  const [picked, setPicked] = useState<Set<SeriesKey> | null>(null);
  const visible = picked ?? defaultVisible;

  const toggle = (key: SeriesKey) => {
    const next = new Set(visible);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setPicked(next);
  };

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        {SERIES.map((series) => {
          const isOn = visible.has(series.key);
          return (
            <UnstyledButton
              key={series.key}
              onClick={() => toggle(series.key)}
              aria-pressed={isOn}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                isOn
                  ? 'border-border-primary bg-surface-hover text-text-primary'
                  : 'border-border-secondary text-text-muted hover:text-text-secondary'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: isOn ? series.color : 'var(--color-text-muted)',
                }}
              />
              {series.label}
            </UnstyledButton>
          );
        })}
      </Group>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
          <CartesianGrid
            strokeDasharray="2 2"
            stroke="var(--color-border-secondary)"
          />
          <XAxis
            dataKey="name"
            stroke="var(--color-text-muted)"
            fontSize={11}
            tickFormatter={shortName}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            yAxisId="left"
            stroke="var(--color-text-muted)"
            fontSize={11}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            stroke="var(--color-text-muted)"
            fontSize={11}
          />
          <Tooltip
            content={({
              active,
              payload,
              label,
            }: {
              active?: boolean;
              payload?: Array<{ payload: (typeof chartData)[number] }>;
              label?: string | number;
            }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload;
              if (!row) return null;
              return (
                <div className="rounded-md border border-border-primary bg-surface-primary p-3 shadow-lg">
                  <Text size="xs" fw={600} className="mb-1 text-text-primary">
                    {String(label ?? row.name)}
                  </Text>
                  {SERIES.filter((s) => visible.has(s.key)).map((s) => (
                    <Text key={s.key} size="xs" className="text-text-secondary">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}: {formatSeriesValue(s.key, row[s.key])}
                    </Text>
                  ))}
                  <Text size="xs" className="mt-1 text-text-muted">
                    {row.totalTickets}{' '}
                    {row.totalTickets === 1 ? 'ticket' : 'tickets'} in cycle
                  </Text>
                </div>
              );
            }}
          />
          {SERIES.filter((s) => visible.has(s.key)).map((s) => (
            <Line
              key={s.key}
              yAxisId={s.axis}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Stack>
  );
}
