'use client';

import { Skeleton } from '@mantine/core';
import {
  IconCheck,
  IconClipboardList,
  IconCirclePlus,
  IconEdit,
  IconMessageCircle,
  IconRefresh,
  IconStatusChange,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import type { IconKind } from '~/server/services/activity/feedRenderHints';

const ICON_BY_KIND: Record<IconKind, TablerIcon> = {
  created: IconCirclePlus,
  updated: IconEdit,
  status_changed: IconStatusChange,
  completed: IconCheck,
  commented: IconMessageCircle,
  fallback: IconRefresh,
};

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

/** "just now" / "5 minutes ago" / "yesterday" etc. Falls back to ISO date. */
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

/**
 * Render a sentence template into spans, replacing {actor} and {entityRef}
 * tokens with styled inline content. Tokens not in the template are simply
 * dropped — the fallback hint uses both tokens so this never under-renders.
 */
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

/**
 * Workspace activity feed card. Renders the most recent events for the
 * workspace ordered newest-first, with click-to-load-more pagination via
 * the cursor returned by `workspace.getActivityFeed`.
 *
 * Each row shows an actor avatar (initials or image), a sentence
 * generated from the registered render hint, a relative timestamp, and a
 * small right-side icon coloured by event kind.
 */
export function ActivityFeed() {
  const { workspace, workspaceId, workspaceSlug } = useWorkspace();
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<
    Array<{
      id: string;
      createdAt: Date;
      hint: { template: string; iconKind: IconKind };
      entityRef: string;
      actor: { id: string; name: string | null; image: string | null } | null;
    }>
  >([]);

  const { data, isLoading } = api.workspace.getActivityFeed.useQuery(
    { workspaceId: workspaceId ?? '', cursor: cursor ?? undefined },
    {
      enabled: !!workspaceId,
    },
  );

  // Accumulate pages locally as the user clicks "View older".
  const events = (data?.events ?? []).map((e) => ({
    ...e,
    createdAt: new Date(e.createdAt),
  }));
  const merged = cursor === null ? events : [...accumulated, ...events];
  // De-dupe across React re-renders when the query refires for the current cursor.
  const seen = new Set<string>();
  const display = merged.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });

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
          {display.map((event) => {
            const Icon = ICON_BY_KIND[event.hint.iconKind] ?? IconRefresh;
            const actorName = event.actor?.name ?? 'Someone';
            return (
              <div key={event.id} className="wsa-feed__row">
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
                  <span className="wsa-feed__time">
                    {relativeTime(event.createdAt)}
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
              <button
                type="button"
                className="wsa-feed__footer-btn"
                onClick={() => {
                  if (data?.nextCursor) {
                    setAccumulated(display);
                    setCursor(data.nextCursor);
                  }
                }}
                disabled={isLoading}
              >
                View older activity
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
