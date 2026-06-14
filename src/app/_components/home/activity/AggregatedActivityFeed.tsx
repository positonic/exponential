'use client';

import { Button, Container, Skeleton, Stack, Text, Title } from '@mantine/core';
import {
  IconCheck,
  IconCirclePlus,
  IconClipboardList,
  IconEdit,
  IconMessageCircle,
  IconRefresh,
  IconStatusChange,
  IconTrophy,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '~/trpc/react';
import type { IconKind } from '~/server/services/activity/feedRenderHints';
import { WeeklyWorkDigestPanel } from './WeeklyWorkDigestPanel';

import './activity-home.css';

const ICON_BY_KIND: Record<IconKind, TablerIcon> = {
  created: IconCirclePlus,
  updated: IconEdit,
  status_changed: IconStatusChange,
  completed: IconCheck,
  commented: IconMessageCircle,
  milestone: IconTrophy,
  fallback: IconRefresh,
};

const PAGE_SIZE = 50;

const RTF =
  typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl
    ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    : null;

const TIME_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

function relativeTime(date: Date, now: Date = new Date()): string {
  const deltaSec = (date.getTime() - now.getTime()) / 1000;
  const absSec = Math.abs(deltaSec);
  if (absSec < 30) return 'just now';
  if (!RTF) return date.toISOString().slice(0, 10);
  for (const [unit, secs] of TIME_UNITS) {
    if (absSec >= secs) {
      const value = Math.round(deltaSec / secs);
      return RTF.format(value, unit);
    }
  }
  return RTF.format(Math.round(deltaSec / 60), 'minute');
}

function initialsOf(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

interface SentenceProps {
  template: string;
  actor: string;
  entityRef: string;
}

function Sentence({ template, actor, entityRef }: SentenceProps) {
  const parts: Array<{ kind: 'text' | 'actor' | 'entity'; value: string }> = [];
  const regex = /\{(actor|entityRef)\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    if (match.index > cursor) {
      parts.push({ kind: 'text', value: template.slice(cursor, match.index) });
    }
    parts.push({
      kind: match[1] === 'actor' ? 'actor' : 'entity',
      value: match[1] === 'actor' ? actor : entityRef,
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) {
    parts.push({ kind: 'text', value: template.slice(cursor) });
  }
  return (
    <span className="wsa-feed__sentence">
      {parts.map((part, i) => {
        if (part.kind === 'actor') {
          return (
            <span key={i} className="wsa-feed__actor">
              {part.value}
            </span>
          );
        }
        if (part.kind === 'entity') {
          return (
            <span key={i} className="wsa-feed__entity">
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}

interface AccumulatedEvent {
  id: string;
  createdAt: Date;
  hint: { template: string; iconKind: IconKind };
  entityRef: string;
  actor: { id: string; name: string | null; image: string | null } | null;
  workspace: { id: string; name: string; slug: string } | null;
}

/**
 * Top-level `/activity` feed aggregated across every workspace the user can
 * see. Mirrors `WorkspaceActivityFullFeed` but is workspace-agnostic — it
 * reads `workspace.getMyActivityFeed` (no workspaceId) and badges each row
 * with its originating workspace, linking through to that workspace's own
 * activity page.
 */
export function AggregatedActivityFeed() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<AccumulatedEvent[]>([]);

  const { data, isLoading } = api.workspace.getMyActivityFeed.useQuery({
    cursor: cursor ?? undefined,
    limit: PAGE_SIZE,
  });

  const fresh = (data?.events ?? []).map((e) => ({
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
              {display.map((event) => {
                const Icon = ICON_BY_KIND[event.hint.iconKind] ?? IconRefresh;
                const actorName = event.actor?.name ?? 'Someone';
                return (
                  <div
                    key={event.id}
                    className="wsa-feed__row"
                    data-kind={event.hint.iconKind}
                  >
                    <div
                      className={`wsa-feed__avatar${event.actor ? '' : ' wsa-feed__avatar--anonymous'}`}
                      aria-hidden="true"
                    >
                      {event.actor?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={event.actor.image} alt="" />
                      ) : (
                        initialsOf(event.actor?.name ?? null)
                      )}
                    </div>
                    <div className="wsa-feed__body">
                      <Sentence
                        template={event.hint.template}
                        actor={actorName}
                        entityRef={event.entityRef}
                      />
                      <span className="wsa-feed__meta">
                        {event.workspace ? (
                          <Link
                            href={`/w/${event.workspace.slug}/activity`}
                            className="wsa-feed__workspace"
                          >
                            {event.workspace.name}
                          </Link>
                        ) : null}
                        <span className="wsa-feed__time">
                          {relativeTime(event.createdAt)}
                        </span>
                      </span>
                    </div>
                    <span
                      className="wsa-feed__icon"
                      data-kind={event.hint.iconKind}
                      aria-hidden="true"
                    >
                      <Icon size={14} stroke={1.8} />
                    </span>
                  </div>
                );
              })}

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
