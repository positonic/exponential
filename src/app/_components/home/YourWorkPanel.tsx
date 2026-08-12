'use client';

import Link from 'next/link';
import { Skeleton, UnstyledButton } from '@mantine/core';
import { IconSquareRoundedCheck } from '@tabler/icons-react';
import { api, type RouterOutputs } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import styles from './YourWorkPanel.module.css';

type ActionRow = RouterOutputs['action']['getAll'][number];

/**
 * Due-date buckets, in display order. "This week" means within the next
 * 7 days; everything dated beyond that is "Later".
 */
const BUCKET_ORDER = ['Overdue', 'Today', 'This week', 'Later', 'No due date'] as const;
type Bucket = (typeof BUCKET_ORDER)[number];

function bucketFor(dueDate: Date | null, now: Date): Bucket {
  if (!dueDate) return 'No due date';
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const weekOut = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (dueDate < startOfToday) return 'Overdue';
  if (dueDate < startOfTomorrow) return 'Today';
  if (dueDate < weekOut) return 'This week';
  return 'Later';
}

function formatDue(dueDate: Date): string {
  return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const MAX_ROWS = 8;

/**
 * "Your work" — the per-user aggregation on the workspace home: everything
 * assigned to the current user in this workspace. This tracer renders the
 * assigned-actions section; assigned tickets, DRI objects, and recent
 * meetings slot in as sibling sections.
 */
export function YourWorkPanel() {
  const { workspaceId, workspaceSlug } = useWorkspace();

  // action.getAll is already "mine"-scoped server-side: created-by-me with no
  // assignees OR assigned to me, filtered to this workspace.
  const { data: actions, isLoading } = api.action.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  if (!workspaceId || !workspaceSlug) return null;

  const now = new Date();
  const active = (actions ?? [])
    .filter((a) => a.status === 'ACTIVE')
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const byBucket = new Map<Bucket, ActionRow[]>();
  let shown = 0;
  for (const action of active) {
    if (shown >= MAX_ROWS) break;
    const bucket = bucketFor(action.dueDate ? new Date(action.dueDate) : null, now);
    const rows = byBucket.get(bucket) ?? [];
    rows.push(action);
    byBucket.set(bucket, rows);
    shown += 1;
  }

  if (!isLoading && active.length === 0) {
    // Nothing assigned yet — the panel stays out of the way. The team-pulse
    // empty state (feature action 5) takes over here.
    return null;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeading}>
        Your work
        <Link href={`/w/${workspaceSlug}/actions`}>View all</Link>
      </div>

      <div className={styles.sectionHeading}>Assigned to you</div>
      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={34} mb={4} radius="sm" />
          ))
        : BUCKET_ORDER.map((bucket) => {
            const rows = byBucket.get(bucket);
            if (!rows || rows.length === 0) return null;
            return (
              <div key={bucket}>
                <div className={styles.bucketLabel}>{bucket}</div>
                {rows.map((action) => (
                  <UnstyledButton
                    key={action.id}
                    component={Link}
                    href={`/w/${workspaceSlug}/actions/${action.id}`}
                    className={styles.row}
                  >
                    <IconSquareRoundedCheck
                      size={14}
                      stroke={1.75}
                      style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
                    />
                    <span className={styles.rowLabel}>{action.name}</span>
                    {action.project && (
                      <span className={styles.rowMeta}>{action.project.name}</span>
                    )}
                    {action.dueDate && (
                      <span
                        className={
                          bucket === 'Overdue'
                            ? `${styles.rowMeta} ${styles.rowMetaOverdue}`
                            : styles.rowMeta
                        }
                      >
                        {formatDue(new Date(action.dueDate))}
                      </span>
                    )}
                  </UnstyledButton>
                ))}
              </div>
            );
          })}
    </div>
  );
}
