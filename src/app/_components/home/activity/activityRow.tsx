'use client';

import {
  IconBrandGithub,
  IconBrandSlack,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconCheck,
  IconCirclePlus,
  IconClock,
  IconEdit,
  IconGitMerge,
  IconMessageCircle,
  IconMessages,
  IconRefresh,
  IconRobotFace,
  IconStatusChange,
  IconTrophy,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import Link from 'next/link';
import type { IconKind } from '~/server/services/activity/feedRenderHints';

export const ICON_BY_KIND: Record<IconKind, TablerIcon> = {
  created: IconCirclePlus,
  updated: IconEdit,
  status_changed: IconStatusChange,
  completed: IconCheck,
  commented: IconMessageCircle,
  milestone: IconTrophy,
  tracked: IconClock,
  channel_summary: IconMessages,
  github: IconBrandGithub,
  shipped: IconGitMerge,
  fallback: IconRefresh,
};

const PROVIDER_ICON: Record<string, TablerIcon> = {
  whatsapp: IconBrandWhatsapp,
  slack: IconBrandSlack,
  telegram: IconBrandTelegram,
  github: IconBrandGithub,
};

const PROVIDER_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  telegram: 'Telegram',
  // Explicit, because the generic capitalize fallback would render "Github".
  github: 'GitHub',
};

/** Human label for a provider chip/actor, e.g. "whatsapp" → "WhatsApp". */
export function providerLabel(provider: string): string {
  return (
    PROVIDER_LABEL[provider] ??
    provider.charAt(0).toUpperCase() + provider.slice(1)
  );
}

export function providerIcon(provider: string): TablerIcon {
  return PROVIDER_ICON[provider] ?? IconMessages;
}

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
export function relativeTime(date: Date, now: Date = new Date()): string {
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
  /** Renders the "agent" chip after the actor name (ADR-0049). */
  actorIsAgent?: boolean;
  /** When set, `{entityRef}` renders as an external link to this URL. */
  entityHref?: string | null;
}

/**
 * Render a sentence template into spans, replacing {actor} and {entityRef}
 * tokens with styled inline content.
 */
function Sentence({
  template,
  actor,
  entityRef,
  actorIsAgent = false,
  entityHref = null,
}: SentenceProps) {
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
              {actorIsAgent && (
                <span className="ml-1 inline-flex items-center gap-0.5 rounded border border-border-primary px-1 align-middle text-[10px] text-text-muted">
                  <IconRobotFace size={10} aria-hidden="true" />
                  agent
                </span>
              )}
            </span>
          );
        }
        if (part.kind === 'entity') {
          // External sources (GitHub) pass a href so the title itself is the
          // link out. Internal rows keep a plain span — the feed is not a
          // navigation surface for entities it already renders in-app.
          if (entityHref) {
            return (
              <a
                key={i}
                href={entityHref}
                target="_blank"
                rel="noopener noreferrer"
                className="wsa-feed__entity wsa-feed__entity--link"
              >
                {part.value}
              </a>
            );
          }
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

export interface FeedRowEvent {
  id: string;
  createdAt: Date;
  hint: { template: string; iconKind: IconKind };
  entityRef: string;
  actor: { id: string; name: string | null; image: string | null; isAgent?: boolean } | null;
  workspace: { id: string; name: string; slug: string } | null;
  source: string;
  channel: {
    provider: string;
    displayName: string | null;
    summary: string;
    projectId: string | null;
    projectSlug: string | null;
    projectName: string | null;
  } | null;
  github?: {
    kind: string;
    repoFullName: string;
    repoUrl: string | null;
    branchName: string | null;
    prNumber: number | null;
    prUrl: string | null;
    author: string | null;
    commitCount: number | null;
    commitSha: string | null;
    commitUrl: string | null;
    reviewState: string | null;
    merged: boolean;
  } | null;
}

interface ActivityRowProps {
  event: FeedRowEvent;
  /** Workspace slug for deep-links on single-workspace surfaces. */
  workspaceSlug?: string;
  /** Render the originating-workspace badge (aggregated cross-workspace feed). */
  showWorkspaceBadge?: boolean;
}

/**
 * One activity feed row. Renders `channel_summary` events as the channel
 * (provider icon + name as the actor, summary as the body, deep-linking to the
 * routed project) and never as a human; every other event renders the standard
 * actor-avatar + sentence layout.
 */
export function ActivityRow({
  event,
  workspaceSlug,
  showWorkspaceBadge = false,
}: ActivityRowProps) {
  const slug = event.workspace?.slug ?? workspaceSlug;

  const meta = (
    <span className={showWorkspaceBadge ? 'wsa-feed__meta' : undefined}>
      {showWorkspaceBadge && event.workspace ? (
        <Link
          href={`/w/${event.workspace.slug}/activity`}
          className="wsa-feed__workspace"
        >
          {event.workspace.name}
        </Link>
      ) : null}
      <span className="wsa-feed__time">{relativeTime(event.createdAt)}</span>
    </span>
  );

  if (event.channel) {
    const { channel } = event;
    const ProviderIcon = providerIcon(channel.provider);
    const label = providerLabel(channel.provider);
    const name = channel.displayName ?? label;
    const projectHref =
      slug && channel.projectId && channel.projectSlug
        ? `/w/${slug}/projects/${channel.projectSlug}-${channel.projectId}`
        : null;

    return (
      <div className="wsa-feed__row" data-kind="channel_summary">
        <div
          className="wsa-feed__avatar wsa-feed__avatar--channel"
          data-provider={channel.provider}
          aria-hidden="true"
        >
          <ProviderIcon size={16} stroke={1.8} />
        </div>
        <div className="wsa-feed__body">
          <span className="wsa-feed__sentence">
            <span className="wsa-feed__actor">
              {label} · {name}
            </span>
          </span>
          {channel.summary ? (
            <span className="wsa-feed__summary">{channel.summary}</span>
          ) : null}
          <span className="wsa-feed__meta">
            {projectHref && channel.projectName ? (
              <Link href={projectHref} className="wsa-feed__workspace">
                {channel.projectName}
              </Link>
            ) : null}
            {showWorkspaceBadge && event.workspace ? (
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
          data-kind="channel_summary"
          aria-hidden="true"
        >
          <ProviderIcon size={14} stroke={1.8} />
        </span>
      </div>
    );
  }

  const Icon = ICON_BY_KIND[event.hint.iconKind] ?? IconRefresh;

  // GitHub rows: the actor is often not an Exponential user (outside
  // contributors, bots, or simply an unmapped login), so fall back to the GitHub
  // login rather than the anonymous "Someone" — the login is the more useful
  // identity here, and "Someone merged PR 497" helps nobody.
  const github = event.github ?? null;
  const actorName =
    event.actor?.name ?? github?.author ?? 'Someone';

  if (github) {
    const href = github.prUrl ?? github.commitUrl ?? github.repoUrl;
    const repoHref = github.repoUrl;
    const commitLabel =
      github.kind === 'push' && github.commitCount && github.commitCount > 1
        ? `${github.commitCount} commits`
        : null;

    return (
      <div className="wsa-feed__row" data-kind={event.hint.iconKind}>
        <div
          className="wsa-feed__avatar wsa-feed__avatar--channel"
          data-provider="github"
          aria-hidden="true"
        >
          <IconBrandGithub size={16} stroke={1.8} />
        </div>
        <div className="wsa-feed__body">
          <Sentence
            template={event.hint.template}
            actor={actorName}
            entityRef={event.entityRef}
            actorIsAgent={event.actor?.isAgent ?? false}
            entityHref={href}
          />
          <span className="wsa-feed__meta">
            {repoHref ? (
              <a
                href={repoHref}
                target="_blank"
                rel="noopener noreferrer"
                className="wsa-feed__workspace"
              >
                {github.repoFullName}
              </a>
            ) : (
              <span className="wsa-feed__workspace">{github.repoFullName}</span>
            )}
            {github.branchName ? (
              <span className="wsa-feed__branch">{github.branchName}</span>
            ) : null}
            {commitLabel ? (
              <span className="wsa-feed__branch">{commitLabel}</span>
            ) : null}
            {showWorkspaceBadge && event.workspace ? (
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
  }

  return (
    <div className="wsa-feed__row" data-kind={event.hint.iconKind}>
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
          actorIsAgent={event.actor?.isAgent ?? false}
        />
        {meta}
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
}
