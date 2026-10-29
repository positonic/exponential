'use client';

import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import {
  Card,
  Text,
  Group,
  Stack,
  Progress,
  Container,
  Select,
  Divider,
  SegmentedControl,
  Switch,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
  IconChartBar,
  IconCircleCheck,
  IconBolt,
  IconTrendingUp,
  IconUsers,
  IconGitPullRequest,
} from '@tabler/icons-react';
import { api, type RouterOutputs } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CycleTrendChart } from './CycleTrendChart';
import { ContributorTrendChart } from './ContributorTrendChart';
import { formatHours, formatMinutes } from './format';
import { ContributorsTable } from './ContributorsTable';
import { MemberFilter, useMemberFilter } from './MemberFilter';
import { StatCard } from './StatCard';
import { DeliveryFlowSection } from './DeliveryFlowSection';

/**
 * Metrics page dashboard.
 *
 * Ordered by the question a visitor arrives with:
 *  1. **This cycle** — progress against elapsed time, with deltas vs the
 *     previous cycle. The cycle picker and member filter sit in the header and
 *     scope the whole page.
 *  2. **Delivery flow** — weekly throughput and cycle time from the activity
 *     event log; needs neither cycles nor points.
 *  3. **Trends** — every metric plotted per cycle.
 *  4. **People** — one Contributors table, scoped to this cycle or all time.
 *
 * All numbers are computed live over Tickets; see ADR-0047.
 */
export function MetricsDashboard() {
  const { workspace, workspaceId } = useWorkspace();
  const [memberIds, setMemberIds] = useMemberFilter();
  // Unfiltered requests keep the exact same query key as before the filter
  // existed, so the default view shares its cache.
  const memberFilter = memberIds.length > 0 ? memberIds : undefined;

  const toggleMember = useCallback(
    (userId: string) =>
      setMemberIds(
        memberIds.includes(userId)
          ? memberIds.filter((id) => id !== userId)
          : [...memberIds, userId],
      ),
    [memberIds, setMemberIds],
  );

  const { data: cycles } = api.sprintAnalytics.getCycles.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const [picked, setPicked] = useState<string | null>(null);
  const [peopleScope, setPeopleScope] = useState<'cycle' | 'all'>('cycle');

  // Default the selection to the active cycle (else the most recent), but let
  // an explicit pick win.
  const defaultCycleId = useMemo(() => {
    if (!cycles?.length) return null;
    return (cycles.find((c) => c.status === 'ACTIVE') ?? cycles[0])?.id ?? null;
  }, [cycles]);

  const selectedCycleId = picked ?? defaultCycleId;

  const { data, isLoading } = api.sprintAnalytics.getActiveCycleMetrics.useQuery(
    {
      workspaceId: workspaceId ?? '',
      cycleId: selectedCycleId ?? undefined,
      memberIds: memberFilter,
    },
    { enabled: !!workspaceId, placeholderData: keepWhileSameCycle(selectedCycleId ?? undefined) },
  );

  const { data: allCycles, isLoading: allCyclesLoading } =
    api.sprintAnalytics.getAllCyclesMetrics.useQuery(
      { workspaceId: workspaceId ?? '', memberIds: memberFilter },
      { enabled: !!workspaceId, placeholderData: keepPreviousData },
    );

  // The cycle before the selected one (trend rows run oldest → newest), for
  // the "vs last cycle" deltas.
  const previousCycle = useMemo(() => {
    const rows = allCycles?.cycles ?? [];
    const i = rows.findIndex((c) => c.cycleId === data?.cycleId);
    return i > 0 ? rows[i - 1] : undefined;
  }, [allCycles, data?.cycleId]);

  const cycleOptions = useMemo(
    () =>
      (cycles ?? []).map((c) => ({
        value: c.id,
        label: c.status === 'ACTIVE' ? `${c.name} (active)` : c.name,
      })),
    [cycles],
  );

  return (
    <Container size="xl" className="w-full py-6">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start" gap="md">
          <Group gap="sm" wrap="nowrap">
            <IconChartBar size={24} className="text-text-secondary" />
            <div>
              <Text fw={600} size="xl" className="text-text-primary">
                Metrics
              </Text>
              <Text size="sm" className="text-text-secondary">
                {workspace?.name
                  ? `Delivery metrics for ${workspace.name}`
                  : 'Delivery metrics'}
                {memberIds.length > 0 &&
                  ` · ${memberIds.length} ${memberIds.length === 1 ? 'member' : 'members'} selected`}
              </Text>
            </div>
          </Group>

          <Group gap="sm" wrap="wrap">
            {cycleOptions.length > 0 && (
              <Select
                aria-label="Select cycle"
                data={cycleOptions}
                value={selectedCycleId}
                onChange={setPicked}
                allowDeselect={false}
                checkIconPosition="right"
                w={220}
                size="sm"
              />
            )}
            <MemberFilter
              workspaceId={workspaceId}
              value={memberIds}
              onChange={setMemberIds}
            />
          </Group>
        </Group>

        {isLoading || !workspaceId ? (
          <LoadingState />
        ) : !data ? (
          <EmptyState />
        ) : (
          <CurrentCycleSection
            data={data}
            previous={previousCycle}
            cycleId={selectedCycleId ?? undefined}
            memberIds={memberFilter}
          />
        )}

        <Divider className="border-border-primary" />

        <DeliveryFlowSection workspaceId={workspaceId} memberIds={memberIds} />

        <Divider className="border-border-primary" />

        <TrendsSection
          data={allCycles}
          isLoading={allCyclesLoading || !workspaceId}
        />

        <Divider className="border-border-primary" />

        {workspaceId && (
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="nowrap">
              <SectionTitle title="People" subtitle="Who delivered what" />
              <SegmentedControl
                size="xs"
                value={data ? peopleScope : 'all'}
                onChange={(v) => setPeopleScope(v === 'all' ? 'all' : 'cycle')}
                data={[
                  { value: 'cycle', label: 'This cycle', disabled: !data },
                  { value: 'all', label: 'All time' },
                ]}
              />
            </Group>
            <ContributorTrendCard
              data={allCycles}
              workspaceId={workspaceId}
              memberIds={memberIds}
            />
            <ContributorsTable
              workspaceId={workspaceId}
              cycleId={peopleScope === 'cycle' ? data?.cycleId : undefined}
              memberIds={memberIds}
              onToggleMember={toggleMember}
            />
            <GithubLinkNotice workspaceId={workspaceId} memberIds={memberIds} />
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <Text fw={600} size="lg" className="text-text-primary">
        {title}
      </Text>
      <Text size="sm" className="text-text-secondary">
        {subtitle}
      </Text>
    </div>
  );
}

/** "+3 vs last cycle" / "−2 vs last cycle"; nothing without a previous cycle. */
function delta(current: number, previous: number | undefined, unit = ''): string | null {
  if (previous == null) return null;
  const d = Math.round(current - previous);
  if (d === 0) return 'Same as last cycle';
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}${unit} vs last cycle`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far through its window the cycle is, as whole days and the completion %
 * a straight-line pace would expect by now. Null without both dates.
 */
function cyclePace(start: Date | string | null, end: Date | string | null) {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (e <= s) return null;
  const now = Math.min(Math.max(Date.now(), s), e);
  return {
    day: Math.max(1, Math.ceil((now - s) / DAY_MS)),
    totalDays: Math.ceil((e - s) / DAY_MS),
    expectedRate: ((now - s) / (e - s)) * 100,
  };
}

type TrendRow = NonNullable<AllCycles>['cycles'][number];

function CurrentCycleSection({
  data,
  previous,
  cycleId,
  memberIds,
}: {
  data: CycleMetrics;
  previous: TrendRow | undefined;
  cycleId: string | undefined;
  memberIds: string[] | undefined;
}) {
  const completionRate = Math.round(data.completionRate);
  const pace = cyclePace(data.startDate, data.endDate);
  const behind = pace != null && completionRate + 10 < pace.expectedRate;

  return (
    <Stack gap="md">
      <SectionTitle
        title={data.cycleName}
        subtitle={
          pace
            ? `Day ${pace.day} of ${pace.totalDays}`
            : 'No start/end dates set for this cycle'
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={<IconCircleCheck size={16} className="text-text-muted" />}
          label="Progress"
          value={`${data.completedTickets}/${data.totalTickets}`}
          valueSuffix={`tickets done · ${completionRate}%`}
          hint={
            pace
              ? `${behind ? 'Behind pace' : 'On pace'} — ${Math.round(pace.expectedRate)}% expected by today`
              : undefined
          }
        >
          <Progress
            value={completionRate}
            size="sm"
            radius="xl"
            color={completionRate >= 100 ? 'green' : behind ? 'orange' : 'indigo'}
          />
        </StatCard>

        <StatCard
          icon={<IconBolt size={16} className="text-text-muted" />}
          label="Points delivered"
          value={String(data.completedPoints)}
          valueSuffix={`of ${data.totalPoints}`}
          hint={
            [
              delta(data.completedPoints, previous?.completedPoints),
              data.untrackedWorkEntries > 0
                ? `${formatMinutes(data.untrackedWorkMinutes)} untracked work`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />

        <PrTurnaroundCard cycleId={cycleId} memberIds={memberIds} />
      </div>
    </Stack>
  );
}

function TrendsSection({
  data,
  isLoading,
}: {
  data: AllCycles | undefined;
  isLoading: boolean;
}) {
  const hasTrend = !!data && data.cycles.length >= 2;

  return (
    <Stack gap="md">
      <SectionTitle title="Trends" subtitle="Each metric, cycle by cycle (oldest → newest)" />
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-md bg-surface-hover" />
        ) : !hasTrend ? (
          <Group gap="xs">
            <IconTrendingUp size={16} className="text-text-muted" />
            <Text size="sm" className="text-text-muted">
              The trend appears once two cycles have tickets.
            </Text>
          </Group>
        ) : (
          <CycleTrendChart cycles={data.cycles} />
        )}
      </Card>
    </Stack>
  );
}

/** Per-contributor trend lines, behind a toggle so the People section stays compact. */
function ContributorTrendCard({
  data,
  workspaceId,
  memberIds,
}: {
  data: AllCycles | undefined;
  workspaceId: string;
  memberIds: string[];
}) {
  const [showChart, setShowChart] = useLocalStorage({
    key: 'metrics:show-contributor-trends',
    defaultValue: false,
  });
  if (!data || data.cycles.length < 2) return null;

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs">
            <IconUsers size={16} className="text-text-muted" />
            <Text size="sm" fw={500} className="text-text-secondary">
              By contributor
            </Text>
          </Group>
          <Switch
            size="sm"
            label="Contributor chart"
            checked={showChart}
            onChange={(e) => setShowChart(e.currentTarget.checked)}
          />
        </Group>
        {showChart && (
          <ContributorTrendChart
            workspaceId={workspaceId}
            cycles={data.cycles}
            memberIds={memberIds}
          />
        )}
      </Stack>
    </Card>
  );
}

/**
 * `placeholderData` for the cycle-scoped queries: keep the previous result on
 * screen while only the member filter changes, but never across a cycle switch
 * — otherwise the breakdown briefly mixes two cycles' numbers. Reads the cycle
 * off tRPC's query key (`[path, { input }]`).
 */
function keepWhileSameCycle<T>(cycleId: string | undefined) {
  return (
    previous: T | undefined,
    previousQuery?: { queryKey: readonly unknown[] },
  ): T | undefined => {
    const key = previousQuery?.queryKey[1] as
      | { input?: { cycleId?: string } }
      | undefined;
    return key?.input?.cycleId === cycleId ? previous : undefined;
  };
}

type AllCycles = RouterOutputs['sprintAnalytics']['getAllCyclesMetrics'];

/**
 * When the filter includes members with no linked GitHub account, say so —
 * otherwise their "0 PRs merged" reads as a fact about their work.
 */
function GithubLinkNotice({
  workspaceId,
  memberIds,
}: {
  workspaceId: string;
  memberIds: string[];
}) {
  // Same query (and cache entry) as the all-cycles Contributors table.
  const { data } = api.sprintAnalytics.getContributions.useQuery({
    workspaceId,
    cycleId: undefined,
  });
  if (memberIds.length === 0 || !data) return null;

  const selected = new Set(memberIds);
  const unlinked = data.rows
    .filter((r) => r.userId != null && selected.has(r.userId) && !r.githubLinked)
    .map((r) => r.name ?? r.email ?? 'Unknown');
  if (unlinked.length === 0) return null;

  return (
    <Text size="xs" className="text-text-muted">
      PRs and commits aren&apos;t counted for {unlinked.join(', ')} — no GitHub
      account is linked.
    </Text>
  );
}

type CycleMetrics = NonNullable<
  RouterOutputs['sprintAnalytics']['getActiveCycleMetrics']
>;

function PrTurnaroundCard({
  cycleId,
  memberIds,
}: {
  cycleId: string | undefined;
  memberIds: string[] | undefined;
}) {
  const { workspaceId } = useWorkspace();
  const { data, isLoading } =
    api.sprintAnalytics.getActiveCyclePrTurnaround.useQuery(
      { workspaceId: workspaceId ?? '', cycleId, memberIds },
      { enabled: !!workspaceId, placeholderData: keepWhileSameCycle(cycleId) },
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
        No merged-PR data for this cycle. Turnaround is computed from GitHub PR
        webhook events; it stays empty until a connected repo sends them.
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
