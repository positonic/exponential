'use client';

import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Skeleton,
  Tooltip,
} from '@mantine/core';
import {
  IconChartBar,
  IconRefresh,
  IconSparkles,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';
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
 * Week-in-Review card: weekly headline + delta pill, 7-day sparkline,
 * compare-row (last week / 4-week avg / best week), and an AI-generated
 * narrative paragraph + 3 highlights. The refresh icon in the card head
 * force-regenerates the narrative.
 *
 * Data: stats from `workspace.getHomeStats` (sparkline + multi-week totals
 * sourced from `WorkspaceActivityEvent`); narrative from
 * `workspace.getWeeklyNarrative` (cached per workspace + ISO week).
 */
export function WeekInReview() {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();
  const { data, isLoading } = api.workspace.getHomeStats.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  // Inline AI narrative + 3 highlights. Cached server-side per (workspace,
  // ISO week); the 30-min client staleTime just dampens dev-mode refetches.
  const narrativeQ = api.workspace.getWeeklyNarrative.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId, staleTime: 30 * 60 * 1000 },
  );

  const regenerate = api.workspace.regenerateWeeklyNarrative.useMutation({
    onSuccess: async () => {
      await utils.workspace.getWeeklyNarrative.invalidate({
        workspaceId: workspaceId ?? '',
      });
    },
  });

  const narrativeBusy = narrativeQ.isLoading || regenerate.isPending;

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
          <Group gap={6}>
            <span className="wsa-week__eyebrow">
              <span className="wsa-week__pulse" aria-hidden="true" />
              {range}
            </span>
            <Tooltip label="Regenerate narrative" withArrow position="top">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="Regenerate narrative"
                disabled={!workspaceId || narrativeBusy}
                loading={regenerate.isPending}
                onClick={() => {
                  if (!workspaceId) return;
                  regenerate.mutate({ workspaceId });
                }}
              >
                <IconRefresh size={14} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </div>

        {showSkeleton ? (
          <Skeleton height={36} width="60%" />
        ) : (
          <WeeklyHeadline total={thisWeekTotal} delta={delta} />
        )}

        {narrativeBusy ? (
          <div className="wsa-week__narrative wsa-week__narrative--loading">
            <Loader size="xs" />
            <span className="wsa-card__caption">
              Checking the status of this workspace…
            </span>
          </div>
        ) : narrativeQ.data ? (
          <div className="wsa-week__narrative">
            <p className="wsa-week__narrative-text">
              {narrativeQ.data.narrative}
            </p>
            <ul className="wsa-week__highlights">
              {narrativeQ.data.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        ) : (
          <span
            className="wsa-card__caption"
            style={{ display: 'block', marginTop: 10 }}
          >
            Couldn&apos;t generate this week&apos;s narrative.
          </span>
        )}

        <Group className="wsa-week__cta-row">
          <Tooltip label="Coming soon" withArrow>
            <Button
              size="sm"
              variant="filled"
              color="brand"
              data-disabled
              onClick={(event) => event.preventDefault()}
            >
              Start weekly review
            </Button>
          </Tooltip>
          <Tooltip label="Coming soon" withArrow>
            <Button
              size="sm"
              variant="default"
              leftSection={<IconSparkles size={14} stroke={1.8} />}
              data-disabled
              onClick={(event) => event.preventDefault()}
            >
              Ask agent to summarize
            </Button>
          </Tooltip>
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
