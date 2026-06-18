'use client';

import { Button, Container, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';
import { ActivityRow, type FeedRowEvent } from './activityRow';
import { SourceSwitcher } from './SourceSwitcher';
import { WeeklyWorkDigestPanel } from './WeeklyWorkDigestPanel';

import './activity-home.css';

const PAGE_SIZE = 50;

/**
 * Top-level `/activity` feed aggregated across every workspace the user can
 * see. Mirrors `WorkspaceActivityFullFeed` but is workspace-agnostic — it
 * reads `workspace.getMyActivityFeed` (no workspaceId) and badges each row
 * with its originating workspace, linking through to that workspace's own
 * activity page.
 *
 * The source switcher (ADR-0023) filters by derived source, persisted in
 * `?source=`. Cross-workspace source availability is derived client-side from
 * loaded rows (there's no single workspace to count against), so a provider
 * chip appears once any of its rows have loaded.
 */
export function AggregatedActivityFeed() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const source = searchParams.get('source') ?? 'all';

  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<FeedRowEvent[]>([]);

  useEffect(() => {
    setCursor(null);
    setAccumulated([]);
  }, [source]);

  const { data, isLoading } = api.workspace.getMyActivityFeed.useQuery({
    cursor: cursor ?? undefined,
    limit: PAGE_SIZE,
    source,
  });

  function setSource(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('source');
    else params.set('source', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
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

  // Derive available sources from loaded rows (no single workspace to query).
  const providers = Array.from(
    new Set(display.filter((e) => e.channel).map((e) => e.channel!.provider)),
  );
  const hasInternal = display.some((e) => !e.channel);

  const hasMore = data?.nextCursor != null;
  const isEmpty = !isLoading && display.length === 0;

  return (
    <Container size="md" className="py-8">
      <Stack gap="lg">
        <div>
          <Text size="xs" tt="uppercase" className="text-text-muted" style={{ letterSpacing: '0.08em' }}>
            All workspaces
          </Text>
          <Title order={1} className="text-text-primary" mt={4}>
            Activity
          </Title>
          <Text size="sm" className="text-text-secondary" mt={6}>
            Every event across the workspaces you belong to, newest first.
          </Text>
        </div>

        <WeeklyWorkDigestPanel />

        <section className="wsa-card">
          <div className="wsa-card__head">
            <h2 className="wsa-card__title">
              <IconClipboardList size={14} stroke={1.8} />
              Workspace activity
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
            hasInternal={hasInternal}
            providers={providers}
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
              No activity yet. Events show up here when you create, update,
              complete, or comment on actions and tickets in any of your
              workspaces.
            </p>
          ) : (
            <>
              {display.map((event) => (
                <ActivityRow key={event.id} event={event} showWorkspaceBadge />
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
