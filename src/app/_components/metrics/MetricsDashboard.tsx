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
} from '@mantine/core';
import {
  IconChartBar,
  IconCircleCheck,
  IconBolt,
  IconTrendingUp,
  IconGitPullRequest,
  IconTargetArrow,
} from '@tabler/icons-react';
import { api, type RouterOutputs } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CycleTrendChart } from './CycleTrendChart';
import { formatHours, formatMinutes } from './format';
import { ContributorsTable } from './ContributorsTable';
import { MemberFilter, useMemberFilter } from './MemberFilter';
import { StatCard } from './StatCard';
import { DeliveryFlowSection } from './DeliveryFlowSection';

/**
 * Metrics page dashboard.
 *
 * Three tiers, in the order they answer questions:
 *  1. **Delivery flow** (headline) — completed tickets per week and cycle-time
 *     percentiles over the trailing weeks, from the activity event log. Needs
 *     neither cycles nor points, so it is the number that is always real.
 *  2. **All cycles** — every cycle's metrics summed into one roll-up, with a
 *     line chart tracking each metric across cycles.
 *  3. **Cycle breakdown** — the same metrics for one cycle, chosen from a
 *     dropdown (defaults to the ACTIVE cycle).
 *
 * All numbers are computed live over Tickets — cycle velocity is a
 * completed-ticket **count** with summed points alongside; nothing is read from
 * the dormant `SprintMetrics` table. See ADR-0047 (incl. the Ticket-based and
 * flow-headline amendments).
 *
 * A page-wide **member filter** (kept in `?members=`) narrows every number to
 * the selected people — tickets by assignee, PRs by linked GitHub login, time
 * by who logged it — and each tier carries a per-person Contributors table.
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

          <MemberFilter
            workspaceId={workspaceId}
            value={memberIds}
            onChange={setMemberIds}
          />
        </Group>

        <DeliveryFlowSection workspaceId={workspaceId} memberIds={memberIds} />

        <Divider className="border-border-primary" />

        <AllCyclesSection
          workspaceId={workspaceId}
          memberIds={memberIds}
          onToggleMember={toggleMember}
        />

        <Divider className="border-border-primary" />

        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="nowrap">
            <div>
              <Text fw={600} size="lg" className="text-text-primary">
                Cycle breakdown
              </Text>
              <Text size="sm" className="text-text-secondary">
                The same metrics for a single cycle.
              </Text>
            </div>

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
          </Group>

          {isLoading || !workspaceId ? (
            <LoadingState />
          ) : !data ? (
            <EmptyState />
          ) : (
            <>
              <SelectedCycleMetrics
                data={data}
                cycleId={selectedCycleId ?? undefined}
                memberIds={memberFilter}
              />
              <ContributorsTable
                workspaceId={workspaceId}
                cycleId={data.cycleId}
                memberIds={memberIds}
                onToggleMember={toggleMember}
              />
            </>
          )}
        </Stack>
      </Stack>
    </Container>
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
 * The headline block: every cycle summed into one set of numbers, plus the
 * per-cycle trend chart behind them.
 */
function AllCyclesSection({
  workspaceId,
  memberIds,
  onToggleMember,
}: {
  workspaceId: string | null;
  memberIds: string[];
  onToggleMember: (userId: string) => void;
}) {
  const { data, isLoading } = api.sprintAnalytics.getAllCyclesMetrics.useQuery(
    {
      workspaceId: workspaceId ?? '',
      memberIds: memberIds.length > 0 ? memberIds : undefined,
    },
    { enabled: !!workspaceId, placeholderData: keepPreviousData },
  );

  if (isLoading || !workspaceId) {
    return (
      <Stack gap="md">
        <LoadingState />
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/4 rounded bg-surface-hover" />
            <div className="h-64 rounded bg-surface-hover" />
          </div>
        </Card>
      </Stack>
    );
  }

  if (!data || data.cycleCount === 0) {
    return (
      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        <Stack gap="xs" align="center" className="py-10 text-center">
          <IconChartBar size={32} className="text-text-muted" />
          <Text fw={500} className="text-text-primary">
            No cycle data yet
          </Text>
          <Text size="sm" className="text-text-secondary">
            Once cycles have tickets assigned, their totals and trend appear
            here.
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <div>
          <Text fw={600} size="lg" className="text-text-primary">
            All cycles
          </Text>
          <Text size="sm" className="text-text-secondary">
            Totals across {data.cycleCount}{' '}
            {data.cycleCount === 1 ? 'cycle' : 'cycles'}
          </Text>
        </div>
      </Group>

      <AllCyclesTotals data={data} />

      <GithubLinkNotice workspaceId={workspaceId} memberIds={memberIds} />

      <Card
        withBorder
        radius="md"
        className="border-border-primary bg-surface-secondary"
      >
        <Stack gap="md">
          <Group gap="xs">
            <IconTrendingUp size={16} className="text-text-muted" />
            <Text size="sm" fw={500} className="text-text-secondary">
              Metrics by cycle
            </Text>
            <Text size="xs" className="text-text-muted">
              (oldest → newest)
            </Text>
          </Group>

          {data.cycles.length < 2 ? (
            <Text size="sm" className="text-text-muted">
              Only one cycle has data so far — the trend appears once a second
              cycle has tickets.
            </Text>
          ) : (
            <CycleTrendChart cycles={data.cycles} />
          )}
        </Stack>
      </Card>

      <ContributorsTable
        workspaceId={workspaceId}
        memberIds={memberIds}
        onToggleMember={onToggleMember}
      />
    </Stack>
  );
}

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

function AllCyclesTotals({ data }: { data: AllCycles }) {
  const completionRate = Math.round(data.completionRate);
  const avg = data.avgPrHours != null ? formatHours(data.avgPrHours) : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<IconBolt size={16} className="text-text-muted" />}
        label="Velocity"
        value={String(data.completedTickets)}
        valueSuffix={data.completedTickets === 1 ? 'ticket' : 'tickets'}
        hint={`${data.completedPoints} of ${data.totalPoints} points delivered`}
      />

      <StatCard
        icon={<IconTargetArrow size={16} className="text-text-muted" />}
        label="Tickets tracked"
        value={String(data.totalTickets)}
        valueSuffix="total"
        hint={`${data.totalTickets - data.completedTickets} not yet completed`}
      />

      <StatCard
        icon={<IconCircleCheck size={16} className="text-text-muted" />}
        label="Completion"
        value={`${completionRate}%`}
        valueSuffix={`${data.completedTickets}/${data.totalTickets} tickets`}
      >
        <Progress
          value={completionRate}
          size="sm"
          radius="xl"
          color={completionRate >= 100 ? 'green' : 'indigo'}
        />
      </StatCard>

      <StatCard
        icon={<IconGitPullRequest size={16} className="text-text-muted" />}
        label="PRs merged"
        value={String(data.mergedPrCount)}
        valueSuffix={data.mergedPrCount === 1 ? 'PR' : 'PRs'}
        hint={
          avg
            ? `${avg.value}${avg.unit} avg turnaround`
            : 'Turnaround unavailable — needs GitHub PR webhook events'
        }
      />
    </div>
  );
}

type CycleMetrics = NonNullable<
  RouterOutputs['sprintAnalytics']['getActiveCycleMetrics']
>;

function SelectedCycleMetrics({
  data,
  cycleId,
  memberIds,
}: {
  data: CycleMetrics;
  cycleId: string | undefined;
  memberIds: string[] | undefined;
}) {
  const completionRate = Math.round(data.completionRate);

  return (
    <Stack gap="md">
      <Text size="sm" className="text-text-muted">
        Cycle:{' '}
        <span className="font-medium text-text-secondary">{data.cycleName}</span>
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
            {/* Untracked work (Daily worklog V4): confirmed time in the cycle
                window on Actions with no Ticket — shipped work nobody filed.
                Computed live beside velocity, never stored (ADR-0047). */}
            <Text size="xs" className="text-text-muted" data-testid="untracked-work">
              {data.untrackedWorkEntries === 0
                ? 'No untracked work'
                : `${data.untrackedWorkEntries} untracked ${
                    data.untrackedWorkEntries === 1 ? 'entry' : 'entries'
                  } (${formatMinutes(data.untrackedWorkMinutes)}) with no ticket`}
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
        <PrTurnaroundCard cycleId={cycleId} memberIds={memberIds} />
      </div>
    </Stack>
  );
}

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
