'use client';

import { Button, Container, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import { ActivityRow, type FeedRowEvent } from './activityRow';
import { SourceSwitcher } from './SourceSwitcher';

import './activity-home.css';

const PAGE_SIZE = 50;

/**
 * Full paginated activity feed at `/w/[slug]/activity`. Uses the same
 * `workspace.getActivityFeed` reader as the home card but with a larger page
 * size (50) and a Mantine container chrome. Pagination accumulates pages
 * locally via the "Load more" button.
 *
 * A source switcher (ADR-0023) filters by derived Activity source, persisted in
 * `?source=`; changing it resets pagination. Workspace scoping is enforced by
 * the tRPC procedure — events from other workspaces never reach this surface.
 */
export function WorkspaceActivityFullFeed() {
  const { workspace, workspaceId, workspaceSlug, isLoading: workspaceLoading } =
    useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const source = searchParams.get('source') ?? 'all';

  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<FeedRowEvent[]>([]);

  // Reset pagination whenever the source filter changes — accumulated pages
  // belong to the previous filter.
  useEffect(() => {
    setCursor(null);
    setAccumulated([]);
  }, [source]);

  const { data, isLoading } = api.workspace.getActivityFeed.useQuery(
    {
      workspaceId: workspaceId ?? '',
      cursor: cursor ?? undefined,
      limit: PAGE_SIZE,
      source,
    },
    { enabled: !!workspaceId },
  );

  const { data: sources } = api.workspace.getActivitySources.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  function setSource(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('source');
    else params.set('source', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  if (workspaceLoading || !workspace) {
    return (
      <Container size="md" className="py-8">
        <Stack gap="md">
          <Skeleton height={48} width="40%" />
          <Skeleton height={300} />
        </Stack>
      </Container>
    );
  }

  const fresh: FeedRowEvent[] = (data?.events ?? []).map((e) => ({
    ...e,
    createdAt: new Date(e.createdAt),
  }));
  const merged = cursor === null ? fresh : [...accumulated, ...fresh];
  const seen = new Set<string>();
  const display = merged.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });

  const hasMore = data?.nextCursor != null;
  const isEmpty = !isLoading && display.length === 0;

  return (
    <Container size="md" className="py-8">
      <Stack gap="lg">
        <div>
          <Text size="xs" tt="uppercase" className="text-text-muted" style={{ letterSpacing: '0.08em' }}>
            {workspace.name}
          </Text>
          <Title order={1} className="text-text-primary" mt={4}>
            Activity
          </Title>
          <Text size="sm" className="text-text-secondary" mt={6}>
            Every event in this workspace, newest first. Click an event for more
            once entity links land.
          </Text>
        </div>

        <section className="wsa-card">
          <div className="wsa-card__head">
            <h2 className="wsa-card__title">
              <IconClipboardList size={14} stroke={1.8} />
              All workspace activity
              {data ? (
                <span className="wsa-card__count">
                  {display.length}
                  {hasMore ? '+' : ''}
                </span>
              ) : null}
            </h2>
          </div>

          <SourceSwitcher
            value={source}
            onChange={setSource}
            hasInternal={sources?.hasInternal ?? false}
            providers={sources?.providers ?? []}
          />

          {isLoading && display.length === 0 ? (
            <Stack gap="sm">
              {[0, 1, 2, 3, 4].map((row) => (
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
            </Stack>
          ) : isEmpty ? (
            <p className="wsa-feed__empty">
              No activity yet in <b>{workspace.name}</b>. Events show up here
              when you create, update, complete, or comment on actions and
              tickets. If you&apos;ve been here a while, ask an owner to run
              the activity backfill from workspace settings.
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

              {hasMore ? (
                <div className="wsa-feed__footer">
                  <Button
                    variant="default"
                    size="sm"
                    loading={isLoading}
                    onClick={() => {
                      if (data?.nextCursor) {
                        setAccumulated(display);
                        setCursor(data.nextCursor);
                      }
                    }}
                  >
                    Load more
                  </Button>
                </div>
              ) : display.length > 0 ? (
                <p className="wsa-feed__empty">
                  That&apos;s all of it — {display.length}{' '}
                  {display.length === 1 ? 'event' : 'events'} total.
                </p>
              ) : null}
            </>
          )}
        </section>
      </Stack>
    </Container>
  );
}
