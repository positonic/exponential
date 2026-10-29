'use client';

import { useMemo, useState } from 'react';
import { Group, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '~/trpc/react';

type MetricKey = 'completedTickets' | 'completedPoints' | 'mergedPrs' | 'completionRate';

const METRICS: { value: MetricKey; label: string }[] = [
  { value: 'completedTickets', label: 'Tickets' },
  { value: 'completedPoints', label: 'Points' },
  { value: 'mergedPrs', label: 'PRs' },
  { value: 'completionRate', label: 'Completion %' },
];

/** CSS variables only — cycled when there are more people than colours. */
const PALETTE = [
  'var(--color-brand-primary)',
  'var(--accent-meetings)',
  'var(--accent-crm)',
  'var(--accent-okr)',
  'var(--accent-ritual)',
  'var(--accent-knowledge)',
  'var(--accent-due)',
  'var(--accent-quick)',
];

/** Lines shown by default; the rest are one click away in the legend. */
const DEFAULT_VISIBLE = 5;

/**
 * One line per contributor across every cycle, for one metric at a time.
 * With `focusCycleId`, the timeline stays whole but that cycle is marked and
 * the legend narrows to people active in it, ranked by its tickets. When
 * members are ticked (`memberIds`), the chart shows exactly them — every one
 * drawn, idle or not — instead of the top few.
 * Fetches each cycle's Contributors rows (batched into one request by the tRPC
 * link); a single per-person-per-cycle endpoint would replace this if it stays.
 */
export function ContributorTrendChart({
  workspaceId,
  cycles,
  memberIds,
  focusCycleId,
}: {
  workspaceId: string;
  /** Oldest → newest. */
  cycles: { cycleId: string; cycleName: string }[];
  memberIds: string[];
  /** Omit for all time. Ignored when the cycle isn't on the timeline. */
  focusCycleId?: string;
}) {
  const [metric, setMetric] = useState<MetricKey>('completedTickets');
  // Manual legend picks belong to the scope and selection they were made in.
  const [picked, setPicked] = useState<{ scope: string; ids: Set<string> } | null>(null);
  const focus = cycles.find((c) => c.cycleId === focusCycleId);
  const pickScope = `${focus?.cycleId ?? ''}|${[...memberIds].sort().join(',')}`;

  const results = api.useQueries((t) =>
    cycles.map((c) =>
      t.sprintAnalytics.getContributions({ workspaceId, cycleId: c.cycleId }),
    ),
  );
  const isLoading = results.some((r) => r.isLoading);

  const { people, chartData } = useMemo(() => {
    const filter = memberIds.length > 0 ? new Set(memberIds) : null;
    const totals = new Map<string, { name: string; tickets: number; active: boolean }>();
    const inScope = (cycleId: string) => !focus || cycleId === focus.cycleId;
    const rows = cycles.map((c, i) => {
      const row: Record<string, number | string> = { name: c.cycleName };
      for (const r of results[i]?.data?.rows ?? []) {
        if (!r.userId || (filter && !filter.has(r.userId))) continue;
        const value =
          metric === 'completionRate'
            ? r.assignedTickets > 0
              ? Math.round((r.completedTickets / r.assignedTickets) * 100)
              : 0
            : r[metric];
        row[r.userId] = value;
        const prev = totals.get(r.userId);
        const counts = inScope(c.cycleId);
        totals.set(r.userId, {
          name: r.name ?? r.email ?? 'Unknown',
          tickets: (prev?.tickets ?? 0) + (counts ? r.completedTickets : 0),
          // An idle cycle still plots as 0; only people idle across the whole
          // scope stay out of the legend.
          active:
            (prev?.active ?? false) ||
            (counts && (r.assignedTickets > 0 || r.mergedPrs > 0)),
        });
      }
      return row;
    });
    const sorted = [...totals.entries()]
      // A ticked member is drawn even when idle, so a selection never vanishes.
      .filter(([, v]) => filter != null || v.active)
      .sort((a, b) => b[1].tickets - a[1].tickets)
      .map(([id, v], i) => ({ id, name: v.name, color: PALETTE[i % PALETTE.length]! }));
    return { people: sorted, chartData: rows };
  }, [cycles, results, memberIds, metric, focus]);

  const visible =
    picked && picked.scope === pickScope
      ? picked.ids
      : new Set(
          (memberIds.length > 0 ? people : people.slice(0, DEFAULT_VISIBLE)).map((p) => p.id),
        );
  const toggle = (id: string) => {
    const next = new Set(visible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked({ scope: pickScope, ids: next });
  };

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-md bg-surface-hover" />;
  }
  if (people.length === 0) {
    return (
      <Text size="sm" className="text-text-muted">
        {focus
          ? `No contributor activity in ${focus.cycleName}.`
          : 'No contributor activity in any cycle yet.'}
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Group gap="xs" wrap="wrap">
          {people.map((p) => {
            const isOn = visible.has(p.id);
            return (
              <UnstyledButton
                key={p.id}
                onClick={() => toggle(p.id)}
                aria-pressed={isOn}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                  isOn
                    ? 'border-border-primary bg-surface-hover text-text-primary'
                    : 'border-border-secondary text-text-muted hover:text-text-secondary'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: isOn ? p.color : 'var(--color-text-muted)' }}
                />
                {p.name}
              </UnstyledButton>
            );
          })}
        </Group>
        <SegmentedControl
          size="xs"
          value={metric}
          onChange={(v) => setMetric(v as MetricKey)}
          data={METRICS}
        />
      </Group>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-secondary)" />
          <XAxis
            dataKey="name"
            stroke="var(--color-text-muted)"
            fontSize={11}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            stroke="var(--color-text-muted)"
            fontSize={11}
            allowDecimals={false}
            {...(metric === 'completionRate'
              ? { domain: [0, 100], tickFormatter: (v: number) => `${v}%` }
              : {})}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface-primary)',
              border: '1px solid var(--color-border-primary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--color-text-primary)', fontWeight: 600 }}
            itemSorter={(item) => -Number(item.value ?? 0)}
            formatter={(v: number) => (metric === 'completionRate' ? `${v}%` : v)}
          />
          {focus && (
            <ReferenceLine
              x={focus.cycleName}
              stroke="var(--color-text-muted)"
              strokeDasharray="4 4"
            />
          )}
          {people
            .filter((p) => visible.has(p.id))
            .map((p) => (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.id}
                name={p.name}
                stroke={p.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </Stack>
  );
}
