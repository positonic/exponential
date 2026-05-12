'use client';

import { Skeleton, Text } from '@mantine/core';
import { IconArrowRight, IconTarget } from '@tabler/icons-react';
import { startOfISOWeek } from 'date-fns';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

import './coaching-home.css';

import { CoachingCommitments } from './CoachingCommitments';
import { CoachingGoalCard } from './CoachingGoalCard';
import { CoachingHero } from './CoachingHero';
import { CoachingWeeklyReflection } from './CoachingWeeklyReflection';
import {
  dateFromIsoWeekString,
  isoWeekStringFromDate,
} from './iso-week';

function FocusGoalsZone({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, error } = api.goal.listCoachingFocus.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );

  if (isLoading) {
    return (
      <section className="ch-block">
        <div className="ch-block__head">
          <h2 className="ch-block__title">
            <IconTarget size={14} /> Focus goals — this quarter
          </h2>
        </div>
        <div className="ch-goal-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={220} radius="md" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="ch-block">
        <div className="ch-block__head">
          <h2 className="ch-block__title">
            <IconTarget size={14} /> Focus goals — this quarter
          </h2>
        </div>
        <div className="ch-goal-card__empty">
          <Text size="sm" className="text-text-secondary">
            Couldn&apos;t load focus goals: {error.message}
          </Text>
        </div>
      </section>
    );
  }

  const goals = data?.goals ?? [];

  return (
    <section className="ch-block">
      <div className="ch-block__head">
        <h2 className="ch-block__title">
          <IconTarget size={14} /> Focus goals — this quarter
          {goals.length > 0 ? (
            <span className="ch-block__count">{goals.length}</span>
          ) : null}
        </h2>
        {data?.currentPeriod ? (
          <div className="ch-block__meta">
            <span className="ch-block__filter">{data.currentPeriod}</span>
            <Link href="/goals" className="ch-reflect__history-link">
              All goals <IconArrowRight size={11} />
            </Link>
          </div>
        ) : null}
      </div>

      {goals.length === 0 ? (
        <div className="ch-goal-card__empty">
          <Text size="sm" className="text-text-secondary">
            No active goals for the current quarter
            {data?.currentPeriod ? ` (${data.currentPeriod})` : ''}.
          </Text>
          <Link className="ch-goal-card__empty-link" href="/goals">
            Set a focus goal →
          </Link>
        </div>
      ) : (
        <div className="ch-goal-grid">
          {goals.map((goal) => (
            <CoachingGoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </section>
  );
}

function useSelectedWeekStart(): {
  weekStart: Date;
  isCurrent: boolean;
  setWeekStart: (next: Date) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const weekStart = useMemo(() => {
    const raw = params.get('week');
    const parsed = raw ? dateFromIsoWeekString(raw) : null;
    return parsed ?? startOfISOWeek(new Date());
  }, [params]);

  const currentWeekStart = useMemo(() => startOfISOWeek(new Date()), []);
  const isCurrent = weekStart.getTime() === currentWeekStart.getTime();

  const setWeekStart = useCallback(
    (next: Date) => {
      const nextParams = new URLSearchParams(params.toString());
      nextParams.set('week', isoWeekStringFromDate(next));
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return { weekStart, isCurrent, setWeekStart };
}

export function WorkspaceHomeCoaching() {
  const { workspace } = useWorkspace();
  const { weekStart, isCurrent, setWeekStart } = useSelectedWeekStart();

  return (
    <div className="coaching-home">
      <div className="coaching-home__wrap">
        <CoachingHero
          workspaceName={workspace?.name}
          weekStart={weekStart}
          isCurrentWeek={isCurrent}
          onChangeWeek={setWeekStart}
        />

        {workspace?.id ? (
          <FocusGoalsZone workspaceId={workspace.id} />
        ) : null}

        {workspace?.id ? (
          <CoachingCommitments workspaceId={workspace.id} />
        ) : null}

        <CoachingWeeklyReflection weekStart={weekStart} />
      </div>
    </div>
  );
}
