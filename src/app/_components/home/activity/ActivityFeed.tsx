'use client';

import { Skeleton } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';
import Link from 'next/link';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import { ActivityRow } from './activityRow';

/**
 * Workspace activity feed card. Renders the most recent events for the
 * workspace ordered newest-first, with click-to-load-more pagination via
 * the cursor returned by `workspace.getActivityFeed`.
 *
 * Row rendering (including `channel_summary` rows shown as the channel rather
 * than a person) lives in the shared {@link ActivityRow}. The source switcher
 * lives on the full `/w/[slug]/activity` page, not this compact card.
 */
export function ActivityFeed() {
  const { workspace, workspaceId, workspaceSlug } = useWorkspace();

  // The home card always shows the first page only — the "All activity" CTA
  // and "View older activity" footer both route to /w/{slug}/activity for
  // the paginated view. Keeping this card scoped to one page avoids two
  // overlapping pagination UIs and keeps the home page snappy.
  const { data, isLoading } = api.workspace.getActivityFeed.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const display = (data?.events ?? []).map((e) => ({
    ...e,
    createdAt: new Date(e.createdAt),
  }));
  const hasMore = data?.nextCursor != null;

  return (
    <section className="wsa-card">
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconClipboardList size={14} stroke={1.8} />
          Activity feed
          <span className="wsa-card__count">
            {workspace?.name ?? 'workspace'}
          </span>
        </h2>
        {workspaceSlug ? (
          <Link
            href={`/w/${workspaceSlug}/activity`}
            className="wsa-feed__footer-btn"
          >
            All activity →
          </Link>
        ) : null}
      </div>

      {isLoading && display.length === 0 ? (
        <>
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px minmax(0, 1fr)',
                gap: 12,
                alignItems: 'center',
                padding: '10px 0',
              }}
            >
              <Skeleton circle height={30} width={30} />
              <div>
                <Skeleton height={14} width="68%" />
                <Skeleton height={12} mt={6} width="42%" />
              </div>
            </div>
          ))}
        </>
      ) : display.length === 0 ? (
        <p className="wsa-feed__empty">
          No activity yet. Mutations from now on will show up here.
        </p>
      ) : (
        <>
          {display.map((event) => (
            <ActivityRow
              key={event.id}
              event={event}
              workspaceSlug={workspaceSlug ?? undefined}
            />
          ))}
          {hasMore && workspaceSlug ? (
            <div className="wsa-feed__footer">
              <Link
                href={`/w/${workspaceSlug}/activity`}
                className="wsa-feed__footer-btn"
              >
                View older activity →
              </Link>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
