'use client';

import { IconMessage, IconMessage2 } from '@tabler/icons-react';
import { CoachingGoalSparkline } from './CoachingGoalSparkline';

type Health = 'on-track' | 'at-risk' | 'off-track' | 'no-update' | null;

interface CoachingGoalCardProps {
  goal: {
    id: number;
    title: string;
    health: string | null;
    lifeDomain: {
      id: number;
      title: string;
      color: string | null;
      icon: string | null;
    } | null;
    snapshots: { progress: number; snapshotDate: Date | string }[];
    latestUpdate: { id: string; content: string; createdAt: Date | string } | null;
    commentCount: number;
  };
}

const HEALTH_LABELS: Record<Exclude<Health, null>, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
  'no-update': 'No update',
};

const HEALTH_CLASSES: Record<Exclude<Health, null>, string> = {
  'on-track': 'ch-goal-card__health--ontrack',
  'at-risk': 'ch-goal-card__health--atrisk',
  'off-track': 'ch-goal-card__health--off-track',
  'no-update': 'ch-goal-card__health--no-update',
};

// Maps a LifeDomain.color semantic key to a coaching-home scoped CSS var.
// Falls back to the page accent if the key isn't recognised.
function lifeDomainAccent(color: string | null | undefined): string {
  if (!color) return 'var(--ch-accent)';
  const map: Record<string, string> = {
    'brand-primary': 'var(--ch-brand-400)',
    blue: 'var(--ch-brand-400)',
    indigo: 'var(--ch-accent-ritual)',
    green: 'var(--ch-accent-crm)',
    teal: 'var(--ch-accent-knowledge)',
    cyan: 'var(--ch-accent-knowledge)',
    yellow: 'var(--ch-accent-okr)',
    amber: 'var(--ch-accent-okr)',
    orange: 'var(--ch-accent-okr)',
    red: 'var(--ch-accent-due)',
    pink: 'var(--ch-accent-due)',
    violet: 'var(--ch-accent-meetings)',
    purple: 'var(--ch-accent-meetings)',
    grape: 'var(--ch-accent-meetings)',
    gray: 'var(--ch-accent-neutral)',
    neutral: 'var(--ch-accent-neutral)',
  };
  return map[color.toLowerCase()] ?? 'var(--ch-accent)';
}

function HealthPill({ health }: { health: Health }) {
  const key: Exclude<Health, null> =
    health && health in HEALTH_LABELS ? health : 'no-update';
  return (
    <span className={`ch-goal-card__health ${HEALTH_CLASSES[key]}`}>
      <span className="ch-goal-card__health-dot" />
      {HEALTH_LABELS[key]}
    </span>
  );
}

export function CoachingGoalCard({ goal }: CoachingGoalCardProps) {
  const accent = lifeDomainAccent(goal.lifeDomain?.color);
  const health = goal.health as Health;
  const updateText = goal.latestUpdate?.content?.trim() ?? '';
  const latestProgress = goal.snapshots.at(-1)?.progress;

  return (
    <article
      className="ch-goal-card"
      style={{ ['--ch-card-accent' as string]: accent }}
    >
      <span className="ch-goal-card__rail" aria-hidden />

      <header className="ch-goal-card__head">
        <span className="ch-goal-card__domain">
          <span className="ch-goal-card__domain-dot" aria-hidden />
          {goal.lifeDomain?.title ?? 'No domain'}
        </span>
        <HealthPill health={health} />
      </header>

      <h3 className="ch-goal-card__title">{goal.title}</h3>

      <div className="ch-goal-card__spark">
        <CoachingGoalSparkline
          points={goal.snapshots}
          color={accent}
          ariaLabel={`Progress sparkline for ${goal.title}`}
        />
        <div className="ch-goal-card__spark-axis">
          <span>
            {goal.snapshots.length > 0
              ? `${goal.snapshots.length} wks tracked`
              : 'no snapshots yet'}
          </span>
          <span>
            {latestProgress != null
              ? `now · ${Math.round(latestProgress)}%`
              : '—'}
          </span>
        </div>
      </div>

      <div className="ch-goal-card__update">
        <IconMessage2 size={12} className="ch-goal-card__update-icon" />
        <span className="ch-goal-card__update-text">
          {updateText.length > 0 ? updateText : 'No status updates yet.'}
        </span>
      </div>

      <footer className="ch-goal-card__foot">
        <span>{goal.lifeDomain?.title ?? 'Focus goal'}</span>
        <span className="ch-goal-card__foot-comments">
          <IconMessage size={11} />
          {goal.commentCount}
        </span>
      </footer>
    </article>
  );
}
