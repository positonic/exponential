'use client';

import { Skeleton } from '@mantine/core';
import {
  IconArchive,
  IconCheck,
  IconFlag,
  IconHash,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';

interface CoachingCommitmentsProps {
  workspaceId: string;
}

interface CommitAction {
  id: string;
  name: string;
  status: string;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
}

interface AnnotatedAction extends CommitAction {
  goalTitle: string;
}

function dayChip(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function timeChip(value: Date | string | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export function CoachingCommitments({ workspaceId }: CoachingCommitmentsProps) {
  const { data, isLoading, error } = api.goal.listCoachingFocus.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );

  if (isLoading) {
    return (
      <section className="ch-block">
        <div className="ch-commits">
          <Skeleton height={260} radius="md" />
          <Skeleton height={260} radius="md" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return null;
  }

  const lastWeekKept: AnnotatedAction[] = [];
  const lastWeekMissed: AnnotatedAction[] = [];
  const thisWeek: AnnotatedAction[] = [];

  for (const goal of data.goals) {
    for (const a of goal.lastWeekKept) {
      lastWeekKept.push({ ...a, goalTitle: goal.title });
    }
    for (const a of goal.lastWeekMissed) {
      lastWeekMissed.push({ ...a, goalTitle: goal.title });
    }
    for (const a of goal.thisWeekActions) {
      thisWeek.push({ ...a, goalTitle: goal.title });
    }
  }

  // Sort: kept items first by completedAt asc, then missed.
  lastWeekKept.sort((a, b) => {
    const ax = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bx = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return ax - bx;
  });
  lastWeekMissed.sort((a, b) => a.name.localeCompare(b.name));

  // This week: sort by dueDate asc.
  thisWeek.sort((a, b) => {
    const ax = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bx = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return ax - bx;
  });

  const keptCount = lastWeekKept.length;
  const lastTotal = keptCount + lastWeekMissed.length;
  const thisDone = thisWeek.filter((a) => a.status === 'COMPLETED').length;
  const thisTotal = thisWeek.length;
  const keptPct = lastTotal > 0 ? Math.round((keptCount / lastTotal) * 100) : 0;
  const thisPct = thisTotal > 0 ? Math.round((thisDone / thisTotal) * 100) : 0;

  return (
    <section className="ch-block">
      <div className="ch-commits">
        {/* Last week */}
        <div className="ch-commit-col">
          <div className="ch-commit-col__head">
            <div className="ch-commit-col__title">
              <IconArchive size={13} />
              Last week&apos;s commitments
            </div>
            <div className="ch-commit-col__score">
              <b>
                {keptCount}
                <span>/{lastTotal}</span>
              </b>
              <span className="ch-commit-col__score-label">kept</span>
            </div>
          </div>
          <div className="ch-commit-col__progress">
            <div
              className="ch-commit-col__bar"
              style={{ ['--ch-p' as string]: `${keptPct}%` }}
            />
          </div>

          {lastTotal === 0 ? (
            <div className="ch-commit-col__empty">
              No commitments tracked for last week.
            </div>
          ) : (
            <ul className="ch-commit-list">
              {lastWeekKept.map((a) => (
                <li key={a.id} className="ch-commit is-done">
                  <span className="ch-commit__check" aria-hidden>
                    <IconCheck size={11} />
                  </span>
                  <div className="ch-commit__body">
                    <div className="ch-commit__title">{a.name}</div>
                    <div className="ch-commit__sub">
                      <IconHash size={10} /> {a.goalTitle}
                      <span className="ch-commit__when">
                        {timeChip(a.completedAt)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
              {lastWeekMissed.map((a) => (
                <li key={a.id} className="ch-commit is-missed">
                  <span className="ch-commit__check" aria-hidden>
                    <IconX size={11} />
                  </span>
                  <div className="ch-commit__body">
                    <div className="ch-commit__title">{a.name}</div>
                    <div className="ch-commit__sub">
                      <IconHash size={10} /> {a.goalTitle}
                      <span className="ch-commit__when">missed</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* This week */}
        <div className="ch-commit-col ch-commit-col--this">
          <div className="ch-commit-col__head">
            <div className="ch-commit-col__title">
              <IconFlag size={13} />
              This week&apos;s commitments
            </div>
            <div className="ch-commit-col__score">
              <b>
                {thisDone}
                <span>/{thisTotal}</span>
              </b>
              <span className="ch-commit-col__score-label">
                {thisTotal === 0 ? 'none yet' : 'done'}
              </span>
            </div>
          </div>
          <div className="ch-commit-col__progress">
            <div
              className="ch-commit-col__bar ch-commit-col__bar--this"
              style={{ ['--ch-p' as string]: `${thisPct}%` }}
            />
          </div>

          {thisTotal === 0 ? (
            <div className="ch-commit-col__empty">
              No actions due this week on your focus goals.
            </div>
          ) : (
            <ul className="ch-commit-list">
              {thisWeek.map((a) => {
                const done = a.status === 'COMPLETED' || !!a.completedAt;
                return (
                  <li key={a.id} className={`ch-commit${done ? ' is-done' : ''}`}>
                    <span className="ch-commit__check" aria-hidden>
                      {done ? <IconCheck size={11} /> : null}
                    </span>
                    <div className="ch-commit__body">
                      <div className="ch-commit__title">{a.name}</div>
                      <div className="ch-commit__sub">
                        <IconHash size={10} /> {a.goalTitle}
                      </div>
                    </div>
                    <div className={`ch-commit__day${done ? ' is-done' : ''}`}>
                      {dayChip(a.dueDate)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="ch-commit-col__hint">
            <IconInfoCircle size={11} />
            Pulled from <em>Actions</em> whose Project is linked to one of
            your focus goals.
          </div>
        </div>
      </div>
    </section>
  );
}
