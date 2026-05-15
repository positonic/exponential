'use client';

import { Button, Group, Skeleton } from '@mantine/core';
import {
  IconChartBar,
  IconSparkles,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useAgentModal } from '~/providers/AgentModalProvider';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

const FMT_DATE = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Compute the Mon → Sun range string for the current ISO week. Mirrors the
 * boundaries used by `getWorkspaceHomeStats.weeklySparkline`.
 */
function currentWeekRange(now: Date): string {
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days to go back to reach Monday (ISO week start).
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${FMT_DATE(monday)} – ${FMT_DATE(sunday)}`;
}

interface WeeklyHeadlineProps {
  total: number;
  delta: number;
}

function WeeklyDelta({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="wsa-week__delta wsa-week__delta--up">
        <IconTrendingUp size={11} stroke={1.8} />+{delta} vs last week
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="wsa-week__delta wsa-week__delta--down">
        <IconTrendingDown size={11} stroke={1.8} />
        {delta} vs last week
      </span>
    );
  }
  return <span className="wsa-week__delta wsa-week__delta--flat">steady</span>;
}

function WeeklyHeadline({ total, delta }: WeeklyHeadlineProps) {
  return (
    <div className="wsa-week__headline">
      <span className="wsa-week__num">{total}</span>
      <span className="wsa-week__num-label">
        {total === 1 ? 'event this week' : 'events this week'}
      </span>
      <WeeklyDelta delta={delta} />
    </div>
  );
}

/**
 * Week-in-Review card: weekly headline + delta pill, 7-day sparkline, and
 * compare-row (last week / 4-week avg / best week).
 *
 * Narrative paragraph + 3 highlight rows are intentionally still skeletons
 * — AI narration is out of scope for slice T6 and ships as its own slice
 * later. Disabled CTAs telegraph that the surface is half-built.
 *
 * Data: `workspace.getHomeStats.weeklySparkline` + multi-week totals.
 * All values come from `WorkspaceActivityEvent` daily aggregation.
 */
export function WeekInReview() {
  const { workspaceId, workspaceSlug, workspace } = useWorkspace();
  const { openWithPrompt } = useAgentModal();
  const { data, isLoading } = api.workspace.getHomeStats.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const showSkeleton = isLoading || !data;
  const range = currentWeekRange(new Date());

  const sparkline = data?.weeklySparkline ?? [];
  const sparkMax =
    sparkline.length === 0 ? 0 : Math.max(...sparkline.map((b) => b.count));
  const peakDay = sparkline.find((b) => b.count > 0 && b.count === sparkMax);

  // Total events this week = sum of the sparkline. We don't reuse
  // thisWeek.completed (DailyScore) here because the eyebrow card is
  // tracking workspace activity, not the user's planned/completed task split.
  const thisWeekTotal = sparkline.reduce((acc, b) => acc + b.count, 0);
  const delta = thisWeekTotal - (data?.lastWeekTotal ?? 0);

  return (
    <section className="wsa-card wsa-week">
      <div>
        <div className="wsa-card__head">
          <h2 className="wsa-card__title">
            <IconChartBar size={14} stroke={1.8} />
            Week in review
          </h2>
          <span className="wsa-week__eyebrow">
            <span className="wsa-week__pulse" aria-hidden="true" />
            {range}
          </span>
        </div>

        {showSkeleton ? (
          <Skeleton height={36} width="60%" />
        ) : (
          <WeeklyHeadline total={thisWeekTotal} delta={delta} />
        )}

        {/* Narrative + highlights stay as skeletons this slice. */}
        <Skeleton height={48} mt="md" width="92%" />
        <Skeleton height={14} mt="md" width="82%" />
        <Skeleton height={14} mt={6} width="74%" />
        <span
          className="wsa-card__caption"
          style={{ display: 'block', marginTop: 10 }}
        >
          AI-written narrative + highlights wire in a later slice.
        </span>

        <Group className="wsa-week__cta-row">
          <Button
            size="sm"
            variant="filled"
            color="brand"
            component={Link}
            href={workspaceSlug ? `/w/${workspaceSlug}/weekly-plan` : '#'}
            disabled={!workspaceSlug}
          >
            Start weekly review
          </Button>
          <Button
            size="sm"
            variant="default"
            leftSection={<IconSparkles size={14} stroke={1.8} />}
            onClick={() => {
              const name = workspace?.name ?? 'this workspace';
              openWithPrompt(
                `Summarize what happened in ${name} this week (${range}). Use the workspace activity events to highlight the top 3 most important moments and call out any anomalies vs. last week.`,
              );
            }}
          >
            Ask agent to summarize
          </Button>
        </Group>
      </div>

      <div>
        {showSkeleton ? (
          <Skeleton height={120} />
        ) : (
          <>
            <div className="wsa-week__spark" role="img" aria-label="Daily activity for this week">
              {sparkline.map((bar) => {
                const heightPct =
                  sparkMax === 0 ? 0 : (bar.count / sparkMax) * 100;
                const isPeak = bar.count > 0 && bar.count === sparkMax;
                return (
                  <div key={bar.day} className="wsa-week__spark-col">
                    {bar.count > 0 ? (
                      <span className="wsa-week__spark-val">{bar.count}</span>
                    ) : null}
                    <div
                      className={[
                        'wsa-week__spark-bar',
                        bar.isToday ? 'wsa-week__spark-bar--today' : '',
                        isPeak ? 'wsa-week__spark-bar--peak' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="wsa-week__spark-labels">
              {sparkline.map((bar) => (
                <span
                  key={bar.day}
                  className={
                    bar.isToday
                      ? 'wsa-week__spark-label wsa-week__spark-label--today'
                      : 'wsa-week__spark-label'
                  }
                >
                  {bar.day}
                </span>
              ))}
            </div>
            {peakDay ? (
              <span
                className="wsa-card__caption"
                style={{ display: 'block', marginTop: 10 }}
              >
                Peak: {peakDay.day} ({peakDay.count}{' '}
                {peakDay.count === 1 ? 'event' : 'events'})
              </span>
            ) : null}

            <div className="wsa-week__compare">
              <span>
                <b className="wsa-week__compare-num">{data.lastWeekTotal}</b>
                last week
              </span>
              <span>
                <b className="wsa-week__compare-num">{data.fourWeekAvg}</b>
                4-week avg
              </span>
              <span>
                <b className="wsa-week__compare-num">{data.bestWeekTotal}</b>
                best week
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
