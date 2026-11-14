'use client';

import { Button, Skeleton, Stack } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';
import {
  ActivityRow,
  type FeedRowEvent,
} from '~/app/_components/home/activity/activityRow';
import { SourceSwitcher } from '~/app/_components/home/activity/SourceSwitcher';
import { groupByDay } from './groupByDay';

const PAGE_SIZE = 50;

interface PersonFeedProps {
  userId: string;
  /** The subject's display name, for the empty state. */
  name: string;
  /** Selected shared workspace, or `null` for every workspace. */
  workspaceId: string | null;
  /** Activity source: `all` | `internal` | a provider. */
  source: string;
  onSourceChange: (source: string) => void;
}

/**
 * The subject's activity, newest first and grouped by day. Read-only: there is
 * nothing to post. Older history loads a page at a time; changing a filter
 * starts again from the newest page.
 */
export function PersonFeed({
  userId,
  name,
  workspaceId,
  source,
  onSourceChange,
}: PersonFeedProps) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<FeedRowEvent[]>([]);

  // Loaded pages belong to the previous subject or filter.
  useEffect(() => {
    setCursor(null);
    setAccumulated([]);
  }, [userId, workspaceId, source]);

  const { data, isLoading } = api.person.getFeed.useQuery(
    {
      userId,
      cursor: cursor ?? undefined,
      limit: PAGE_SIZE,
      source,
      workspaceId: workspaceId ?? undefined,
    },
    { retry: false },
  );

  const fresh: FeedRowEvent[] = (data?.events ?? []).map((event) => ({
    ...event,
    createdAt: new Date(event.createdAt),
  }));
  const merged = cursor === null ? fresh : [...accumulated, ...fresh];
  const seen = new Set<string>();
  const display = merged.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });

  // Source chips come from loaded rows, as on `/activity`: there is no single
  // workspace to count sources against. A filtered feed only loads rows of one
  // source, so remember every source seen for this subject and workspace —
  // otherwise picking a chip would make the other chips disappear.
  const loadedProviders = Array.from(
    new Set([
      ...display.filter((e) => e.channel).map((e) => e.channel!.provider),
      ...(display.some((e) => e.github) ? ['github'] : []),
    ]),
  ).sort();
  const loadedInternal = display.some((e) => !e.channel && !e.github);
  const loadedProviderKey = loadedProviders.join(',');

  const [known, setKnown] = useState<{
    providers: string[];
    hasInternal: boolean;
  }>({ providers: [], hasInternal: false });

  useEffect(() => {
    setKnown({ providers: [], hasInternal: false });
  }, [userId, workspaceId]);

  useEffect(() => {
    const loaded = loadedProviderKey ? loadedProviderKey.split(',') : [];
    setKnown((prev) => {
      const providers = Array.from(new Set([...prev.providers, ...loaded]));
      const hasInternal = prev.hasInternal || loadedInternal;
      const unchanged =
        providers.length === prev.providers.length &&
        hasInternal === prev.hasInternal;
      return unchanged ? prev : { providers, hasInternal };
    });
  }, [loadedProviderKey, loadedInternal]);

  // A source named in the URL keeps its chip even before any of its rows have
  // loaded, so there is always a way back to "All".
  const isProviderSource = source !== 'all' && source !== 'internal';
  const providers =
    isProviderSource && !known.providers.includes(source)
      ? [...known.providers, source]
      : known.providers;
  const hasInternal = known.hasInternal || source === 'internal';

  const hasMore = data?.nextCursor != null;
  const isEmpty = !isLoading && display.length === 0;
  const days = groupByDay(display);

  return (
    <section className="wsa-card" aria-label={`${name}'s activity`}>
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconClipboardList size={14} stroke={1.8} />
          Activity
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
        onChange={onSourceChange}
        hasInternal={hasInternal}
        providers={providers}
      />

      {isLoading && display.length === 0 ? (
        <Stack gap="sm">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center gap-3 py-2">
              <Skeleton circle height={30} width={30} />
              <div className="min-w-0 flex-1">
                <Skeleton height={14} width="68%" />
                <Skeleton height={12} mt={6} width="42%" />
              </div>
            </div>
          ))}
        </Stack>
      ) : isEmpty ? (
        <p className="wsa-feed__empty">
          Nothing from {name} yet
          {workspaceId ? ' in this workspace' : ' in your workspaces'}
          {source === 'all' ? '' : ' from this source'}.
        </p>
      ) : (
        <>
          {days.map((day) => (
            <section key={day.key} className="wsa-feed__day">
              <h3 className="wsa-feed__day-label">{day.label}</h3>
              {day.items.map((event) => (
                <ActivityRow key={event.id} event={event} showWorkspaceBadge />
              ))}
            </section>
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
          ) : (
            <p className="wsa-feed__empty">
              That&apos;s all of it — {display.length}{' '}
              {display.length === 1 ? 'event' : 'events'} total.
            </p>
          )}
        </>
      )}
    </section>
  );
}
