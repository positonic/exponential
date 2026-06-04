'use client';

import { Skeleton } from '@mantine/core';
import { IconArrowRight, IconTarget } from '@tabler/icons-react';
import Link from 'next/link';
import type { GoalHealth } from '~/server/services/activity/workspaceFocusSummary';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

const HEALTH_CLASS: Record<GoalHealth, string> = {
  'on-track': 'wsa-hero__focus-dot--on-track',
  'at-risk': 'wsa-hero__focus-dot--at-risk',
  'off-track': 'wsa-hero__focus-dot--off-track',
  'no-update': 'wsa-hero__focus-dot--no-update',
};

const MAX_VISIBLE = 3;

/**
 * Hero right-column widget for the Activity home. Surfaces the goals the user
 * pinned to focus on this week (from the portfolio weekly review). When no
 * focus is set, it falls back to an at-a-glance summary of active goals and a
 * CTA into the portfolio review (`/weekly-plan`) where focus is chosen.
 *
 * Replaces the previous This week / Day streak / Active projects KPIs.
 */
export function WeeklyFocusSummary() {
  const { workspaceId, workspaceSlug } = useWorkspace();
  const { data, isLoading } = api.workspace.getFocusSummary.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  if (isLoading || !data) {
    return (
      <div className="wsa-hero__focus">
        <Skeleton height={11} width={120} />
        <Skeleton height={18} width={200} mt={12} />
        <Skeleton height={18} width={170} mt={8} />
      </div>
    );
  }

  if (data.hasFocus) {
    const visible = data.focusGoals.slice(0, MAX_VISIBLE);
    const remaining = data.focusGoals.length - visible.length;
    return (
      <div className="wsa-hero__focus">
        <span className="wsa-hero__focus-eyebrow">
          <IconTarget size={13} stroke={1.8} />
          This week&apos;s focus
        </span>
        {data.focusText ? (
          <p className="wsa-hero__focus-theme">{data.focusText}</p>
        ) : null}
        <ul className="wsa-hero__focus-list">
          {visible.map((goal) => (
            <li className="wsa-hero__focus-goal" key={goal.id}>
              <span
                className={`wsa-hero__focus-dot ${HEALTH_CLASS[goal.health]}`}
                aria-hidden="true"
              />
              <Link
                href={
                  workspaceSlug
                    ? `/w/${workspaceSlug}/goals/${goal.id}`
                    : '#'
                }
                className="wsa-hero__focus-title"
              >
                {goal.title}
              </Link>
              {goal.progress !== null ? (
                <span className="wsa-hero__focus-pct">{goal.progress}%</span>
              ) : null}
            </li>
          ))}
        </ul>
        {remaining > 0 ? (
          <Link
            href={workspaceSlug ? `/w/${workspaceSlug}/goals` : '#'}
            className="wsa-hero__focus-more"
          >
            +{remaining} more
          </Link>
        ) : null}
      </div>
    );
  }

  // ── At-a-glance fallback (no focus set this week) ──────────────────────
  const { activeCount, onTrack, atRisk, offTrack } = data.glance;
  const breakdown = [
    onTrack > 0 ? `${onTrack} on-track` : null,
    atRisk > 0 ? `${atRisk} at-risk` : null,
    offTrack > 0 ? `${offTrack} off-track` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="wsa-hero__focus">
      <span className="wsa-hero__focus-eyebrow">
        <IconTarget size={13} stroke={1.8} />
        Goals
      </span>
      <div className="wsa-hero__focus-glance">
        <span className="wsa-hero__focus-count">{activeCount}</span>
        <span className="wsa-hero__focus-count-label">
          {activeCount === 1 ? 'active goal' : 'active goals'}
        </span>
      </div>
      <span className="wsa-hero__focus-breakdown">
        {activeCount === 0
          ? 'No active goals this period'
          : breakdown.length > 0
            ? breakdown.join(' · ')
            : 'No health updates yet'}
      </span>
      <Link href="/weekly-plan" className="wsa-hero__focus-cta">
        Set this week&apos;s focus
        <IconArrowRight size={13} stroke={1.8} />
      </Link>
    </div>
  );
}
