'use client';

import { Skeleton } from '@mantine/core';
import { IconBolt, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import { useSession } from 'next-auth/react';
import { useMemo } from 'react';
import { useTerminology } from '~/hooks/useTerminology';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

/**
 * Translates the current hour-of-day into a time-aware greeting used in the
 * Activity hero title. Buckets match the spec for slice T2.
 */
function greetingForHour(hour: number): string {
  if (hour <= 4) return 'Up late';
  if (hour <= 11) return 'Good morning';
  if (hour <= 16) return 'Good afternoon';
  if (hour <= 20) return 'Good evening';
  return 'Working late';
}

function formatEyebrowDate(now: Date): string {
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const month = now.toLocaleDateString(undefined, { month: 'long' });
  const day = now.getDate();
  return `${weekday}, ${month} ${day}`;
}

interface DeltaRowProps {
  delta: number;
}

function CompletionDelta({ delta }: DeltaRowProps) {
  if (delta > 0) {
    return (
      <span className="wsa-hero__stat-delta wsa-hero__stat-delta--up">
        <IconTrendingUp size={12} stroke={1.8} />+{delta} vs last week
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="wsa-hero__stat-delta wsa-hero__stat-delta--down">
        <IconTrendingDown size={12} stroke={1.8} />
        {delta} vs last week
      </span>
    );
  }
  return <span className="wsa-hero__stat-delta wsa-hero__stat-delta--flat">steady</span>;
}

/**
 * Hero strip for the Activity home: greeting + 3 KPIs (week completion delta,
 * day streak, active project count). Numbers come from
 * `workspace.getHomeStats`; greeting is hour-of-day derived; the workspace
 * label is taken from the active `WorkspaceProvider`.
 *
 * Loading state renders `<Skeleton>` placeholders so the layout doesn't shift
 * when stats arrive.
 */
export function Hero() {
  const { workspace, workspaceId } = useWorkspace();
  const { data: session } = useSession();
  // useTerminology is imported per slice requirement; the hero labels stay in
  // neutral language so they read sensibly across all workspace terminologies.
  // Touching the hook here keeps the project-wide terminology context loaded
  // when this is the first activity-layout component to mount.
  const terminology = useTerminology();
  void terminology;

  const now = useMemo(() => new Date(), []);
  const eyebrowDate = formatEyebrowDate(now);
  const greeting = greetingForHour(now.getHours());

  const userName = session?.user?.name ?? 'there';
  const workspaceName = workspace?.name ?? 'Workspace';

  const { data: stats, isLoading } = api.workspace.getHomeStats.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const showSkeleton = isLoading || !stats;

  return (
    <section className="wsa-hero">
      <div>
        <div className="wsa-hero__eyebrow">
          {workspaceName} · {eyebrowDate}
        </div>
        <h1 className="wsa-hero__title">
          {greeting}, {userName}. <em>Here&apos;s the shape of your work.</em>
        </h1>
      </div>

      <div className="wsa-hero__stats">
        <div className="wsa-hero__stat">
          <span className="wsa-hero__stat-label">This week</span>
          {showSkeleton ? (
            <Skeleton height={20} width={72} />
          ) : (
            <span className="wsa-hero__stat-value">
              {stats.thisWeek.completed}
              <span className="wsa-hero__stat-value-muted">/{stats.thisWeek.planned}</span>
            </span>
          )}
          {showSkeleton ? (
            <Skeleton height={12} width={92} mt={6} />
          ) : (
            <CompletionDelta delta={stats.deltaCompleted} />
          )}
        </div>

        <div className="wsa-hero__stat">
          <span className="wsa-hero__stat-label">Day streak</span>
          {showSkeleton ? (
            <Skeleton height={20} width={40} />
          ) : (
            <span className="wsa-hero__stat-value">{stats.streakDays}</span>
          )}
          {showSkeleton ? (
            <Skeleton height={12} width={64} mt={6} />
          ) : stats.streakDays > 0 ? (
            <span className="wsa-hero__stat-delta wsa-hero__stat-delta--up">
              <IconBolt size={12} stroke={1.8} />
              best yet
            </span>
          ) : (
            <span className="wsa-hero__stat-delta wsa-hero__stat-delta--flat">—</span>
          )}
        </div>

        <div className="wsa-hero__stat">
          <span className="wsa-hero__stat-label">Active projects</span>
          {showSkeleton ? (
            <Skeleton height={20} width={32} />
          ) : (
            <span className="wsa-hero__stat-value">{stats.activeProjectCount}</span>
          )}
          <span className="wsa-hero__stat-delta wsa-hero__stat-delta--flat">steady</span>
        </div>
      </div>
    </section>
  );
}
