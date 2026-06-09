'use client';

import {
  ActionIcon,
  Button,
  Loader,
  Skeleton,
  Tooltip,
} from '@mantine/core';
import {
  IconChartBar,
  IconPlayerPlay,
  IconRefresh,
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

/**
 * Bar-height in px within the 150px plot (which reserves ~46px for the value
 * label, day label, and gaps, leaving ~104px for the tallest bar). Future days
 * are rendered as a fixed dashed stub via CSS, so this returns 0 for them and
 * the `--future` modifier takes over.
 *
 *   height = value ? max(6, round(value / max * 104)) : 0
 */
function barHeightPx(value: number, max: number): number {
  return value ? Math.max(6, Math.round((value / max) * 104)) : 0;
}

function WeeklyDelta({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="wsa-week__delta wsa-week__delta--up">
        <IconTrendingUp size={12} stroke={1.8} />+{delta} vs last week
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="wsa-week__delta wsa-week__delta--down">
        <IconTrendingDown size={12} stroke={1.8} />
        {delta} vs last week
      </span>
    );
  }
  return <span className="wsa-week__delta wsa-week__delta--flat">steady</span>;
}

/**
 * Week-in-Review card — "Direction A · refined bars" redesign.
 *
 * Left column: eyebrow + range pill, a large headline event count with a
 * signed week-over-week delta pill, the AI narrative, three highlight rows,
 * and two CTAs. Right column: an inset "Events per day" chart panel whose bars
 * are classified elapsed / today / future — future days render as dashed ghost
 * stubs with an em-dash rather than zero-height bars (the mid-week fix) — plus
 * a compare footer (last week / 4-week avg / best week).
 *
 * Data: stats from `workspace.getHomeStats` (sparkline + multi-week totals
 * sourced from `WorkspaceActivityEvent`); narrative from
 * `workspace.getWeeklyNarrative` (cached per workspace + ISO week). The refresh
 * icon force-regenerates the narrative.
 */
export function WeekInReview() {
  const { workspaceId, workspaceSlug, workspace } = useWorkspace();
  const { openWithPrompt } = useAgentModal();
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

  // Treat "no workspaceId yet" as busy too — otherwise the disabled query
  // (isLoading=false, data=undefined) would briefly flash the "Couldn't
  // generate" error caption before WorkspaceProvider resolves.
  const narrativeBusy =
    !workspaceId || narrativeQ.isLoading || regenerate.isPending;

  const showSkeleton = isLoading || !data;
  const range = currentWeekRange(new Date());

  const sparkline = data?.weeklySparkline ?? [];
  const sparkMax =
    sparkline.length === 0 ? 0 : Math.max(...sparkline.map((b) => b.count));
  const max = Math.max(sparkMax, 1);
  const peakDay = sparkline.find((b) => b.count > 0 && b.count === sparkMax);

  // Classify each bar as elapsed / today / future from "today". Days after
  // today are future (dashed ghost stub + em-dash) — never zero-height bars.
  // If no bar is flagged today (shouldn't happen for the current ISO week),
  // treat the whole week as elapsed so nothing renders as a ghost.
  const todayIdx = sparkline.findIndex((b) => b.isToday);
  const effTodayIdx = todayIdx === -1 ? sparkline.length - 1 : todayIdx;

  // Total events this week = sum of the sparkline. We don't reuse
  // thisWeek.completed (DailyScore) here because the eyebrow card is
  // tracking workspace activity, not the user's planned/completed task split.
  const thisWeekTotal = sparkline.reduce((acc, b) => acc + b.count, 0);
  const delta = thisWeekTotal - (data?.lastWeekTotal ?? 0);

  return (
    <section className="wsa-card wsa-week">
      {/* ── Left column: textual summary ─────────────────────────────── */}
      <div className="wsa-week__left">
        <div className="wsa-week__eyebrow-row">
          <span className="wsa-week__eyebrow-ico" aria-hidden="true">
            <IconChartBar size={14} stroke={1.8} />
          </span>
          <span className="wsa-week__eyebrow-label">Week in review</span>
          <span className="wsa-week__range">
            <span className="wsa-week__range-dot" aria-hidden="true" />
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
        </div>

        {showSkeleton ? (
          <Skeleton height={58} width="65%" />
        ) : (
          <div className="wsa-week__hero">
            <span className="wsa-week__num">{thisWeekTotal}</span>
            <span className="wsa-week__num-unit">
              {thisWeekTotal === 1 ? 'event logged' : 'events logged'}
            </span>
            <WeeklyDelta delta={delta} />
          </div>
        )}

        {narrativeBusy ? (
          <div className="wsa-week__narrative wsa-week__narrative--loading">
            <Loader size="xs" />
            <span className="wsa-card__caption">
              Checking the status of this workspace…
            </span>
          </div>
        ) : narrativeQ.data ? (
          <>
            <p className="wsa-week__narrative-text">
              {narrativeQ.data.narrative}
            </p>
            <ul className="wsa-week__chips">
              {narrativeQ.data.highlights.map((h, i) => (
                <li className="wsa-week__chip" key={i}>
                  <span className="wsa-week__chip-dot" aria-hidden="true" />
                  <span className="wsa-week__chip-text">{h}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <span
            className="wsa-card__caption"
            style={{ display: 'block', marginTop: 10 }}
          >
            Couldn&apos;t generate this week&apos;s narrative.
          </span>
        )}

        <div className="wsa-week__cta-row">
          <Button
            size="sm"
            variant="filled"
            color="brand"
            leftSection={<IconPlayerPlay size={13} stroke={2} />}
            component={Link}
            href={workspaceSlug ? `/w/${workspaceSlug}/weekly-plan` : '#'}
            disabled={!workspaceSlug}
          >
            Plan next week
          </Button>
          <Button
            size="sm"
            variant="default"
            leftSection={<IconSparkles size={14} stroke={1.8} />}
            onClick={() => {
              const name = workspace?.name ?? 'this workspace';
              const question = `Give me a summary of what happened in ${name} this week (${range}) and what stands out — I may have follow-up questions.`;

              // Seed the chat with the already-computed weekly narrative +
              // stats as context so the agent answers from real data instead
              // of trying (and failing) to fetch activity via tools it lacks.
              // Falls back to the plain question if the narrative hasn't loaded.
              const narrative = narrativeQ.data;
              if (!narrative) {
                openWithPrompt(question);
                return;
              }

              const sparkLine = sparkline
                .map((b) => `${b.day}:${b.count}`)
                .join(', ');
              const deltaLabel =
                delta === 0
                  ? 'steady vs last week'
                  : delta > 0
                    ? `+${delta} vs last week`
                    : `${delta} vs last week`;

              const lines = [
                `WEEKLY ACTIVITY SUMMARY for "${name}" (${range}) — authoritative; answer from this and do NOT call tools to re-derive it:`,
                `Summary: ${narrative.narrative}`,
                'Highlights:',
                ...narrative.highlights.map((h) => `- ${h}`),
                `Events this week: ${thisWeekTotal} (${deltaLabel})`,
                `Last week: ${data?.lastWeekTotal ?? 0} | 4-week avg: ${data?.fourWeekAvg ?? 0} | best week (last 12): ${data?.bestWeekTotal ?? 0}`,
                `Daily event counts (Mon→Sun): ${sparkLine}`,
              ];
              if (peakDay) {
                lines.push(
                  `Busiest day: ${peakDay.day} (${peakDay.count} ${peakDay.count === 1 ? 'event' : 'events'})`,
                );
              }

              openWithPrompt(question, lines.join('\n'));
            }}
          >
            Ask agent to summarize
          </Button>
        </div>
      </div>

      {/* ── Right column: chart panel ────────────────────────────────── */}
      <div className="wsa-week-chart">
        <div className="wsa-week-chart__head">
          <span className="wsa-week-chart__title">Events per day</span>
          {peakDay ? (
            <span className="wsa-week-chart__peak">
              Peak <b>{peakDay.count}</b> · {peakDay.day}
            </span>
          ) : null}
        </div>

        {showSkeleton ? (
          <Skeleton height={150} />
        ) : (
          <>
            <div
              className="wsa-week__bars"
              role="img"
              aria-label="Daily activity for this week"
            >
              {sparkline.map((bar, i) => {
                const isFuture = i > effTodayIdx;
                const cls = [
                  'wsa-week__bar',
                  bar.isToday ? 'wsa-week__bar--today' : '',
                  isFuture ? 'wsa-week__bar--future' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div key={bar.day} className={cls}>
                    <span className="wsa-week__bar-val">
                      {isFuture ? '—' : bar.count}
                    </span>
                    <span
                      className="wsa-week__bar-track"
                      style={{
                        height: isFuture ? 20 : barHeightPx(bar.count, max),
                      }}
                    />
                    <span className="wsa-week__bar-day">{bar.day}</span>
                  </div>
                );
              })}
            </div>

            <div className="wsa-week-chart__foot wsa-week__compare">
              <div className="wsa-week__compare-item">
                <span className="wsa-week__compare-val">
                  {data.lastWeekTotal}
                </span>
                <span className="wsa-week__compare-lbl">Last week</span>
              </div>
              <div className="wsa-week__compare-item">
                <span className="wsa-week__compare-val">{data.fourWeekAvg}</span>
                <span className="wsa-week__compare-lbl">4-week avg</span>
              </div>
              <div className="wsa-week__compare-item">
                <span className="wsa-week__compare-val wsa-week__compare-val--accent">
                  {data.bestWeekTotal}
                </span>
                <span className="wsa-week__compare-lbl">Best week</span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
