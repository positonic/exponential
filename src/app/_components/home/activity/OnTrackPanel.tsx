'use client';

import Link from 'next/link';
import { Skeleton, UnstyledButton } from '@mantine/core';
import {
  IconStack2,
  IconTarget,
  IconTrendingUp,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { compactAge } from '~/app/_components/product/overview/overviewShared';

/** "on-track" → "On track" for chip and row meta text. */
function healthLabel(health: string | null): string {
  if (!health) return 'No update';
  const words = health.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const HEALTH_DOT: Record<string, string> = {
  'on-track': 'wsa-health__dot wsa-health__dot--on-track',
  'at-risk': 'wsa-health__dot wsa-health__dot--at-risk',
  'off-track': 'wsa-health__dot wsa-health__dot--off-track',
};

/**
 * Tier 3 of the daily home: "is what I own on track?" — compressed hard.
 * DRI items render as aggregate health chips; only problem items (at-risk,
 * off-track, no update) get rows. When everything is healthy the card
 * collapses to a single all-clear line, and the stale-check-in nudge lists
 * DRI key results with no check-in since Monday, deep-linking into the OKR
 * drawer. Hidden entirely when the caller is DRI on nothing.
 */
export function OnTrackPanel() {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data: dri, isLoading: driLoading } = api.yourWork.driItems.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );
  const { data: stale, isLoading: staleLoading } =
    api.yourWork.staleCheckins.useQuery(
      { workspaceId: workspaceId ?? '' },
      { enabled: !!workspaceId },
    );

  if (!workspaceId || !workspaceSlug) return null;

  const goals = dri?.goals ?? [];
  const keyResults = dri?.keyResults ?? [];
  const projects = dri?.projects ?? [];
  const staleKrs = stale ?? [];
  const driCount = goals.length + keyResults.length + projects.length;
  const isLoading = driLoading || staleLoading;

  if (isLoading) return <Skeleton height={80} radius={12} />;
  if (driCount === 0 && staleKrs.length === 0) return null;

  // Effective health per item: goals carry `health`, KRs carry
  // statusOverride ?? status; projects have no health signal, so they count
  // as "on track" unless stalled at 0 progress.
  const healthOf = (h: string | null) => h ?? 'no-update';
  const items = [
    ...goals.map((g) => ({
      key: `goal-${g.id}`,
      title: g.title,
      kind: 'Objective',
      health: healthOf(g.health),
      href: `/w/${workspaceSlug}/goals/${g.id}`,
      icon: IconTarget,
    })),
    ...keyResults.map((kr) => ({
      key: `kr-${kr.id}`,
      title: kr.title,
      kind: 'Key result',
      health: healthOf(kr.statusOverride ?? kr.status),
      href: `/w/${workspaceSlug}/goals?tab=okrs&drawer=${encodeURIComponent(`keyResult:${kr.id}`)}`,
      icon: IconTrendingUp,
    })),
    ...projects.map((p) => ({
      key: `project-${p.id}`,
      title: p.name,
      kind: 'Project',
      health: 'on-track',
      href: `/w/${workspaceSlug}/projects/${p.slug}`,
      icon: IconStack2,
    })),
  ];

  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.health, (counts.get(item.health) ?? 0) + 1);
  }
  const problems = items.filter((i) => i.health !== 'on-track');
  const allClear = problems.length === 0 && staleKrs.length === 0;

  return (
    <section className="wsa-card">
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconTarget size={14} stroke={1.8} />
          You&apos;re the DRI
          {driCount > 0 && <span className="wsa-card__count">{driCount}</span>}
        </h2>
        <Link href={`/w/${workspaceSlug}/goals`} className="wsa-sub__action">
          Goals →
        </Link>
      </div>

      {driCount > 0 && (
        <div className="wsa-health">
          {['on-track', 'at-risk', 'off-track', 'no-update']
            .filter((h) => (counts.get(h) ?? 0) > 0)
            .map((h) => (
              <span key={h} className="wsa-health__chip">
                <span className={HEALTH_DOT[h] ?? 'wsa-health__dot'} />
                {counts.get(h)} {healthLabel(h === 'no-update' ? null : h).toLowerCase()}
              </span>
            ))}
        </div>
      )}

      {allClear ? (
        <p className="wsa-health__allclear">
          Everything you own is on track and checked in.
        </p>
      ) : (
        <>
          {problems.map((item) => {
            const Icon = item.icon;
            return (
              <UnstyledButton
                key={item.key}
                component={Link}
                href={item.href}
                className="wsa-item"
              >
                <span className="wsa-item__icon">
                  <Icon size={14} stroke={1.75} />
                </span>
                <span className="wsa-item__label">
                  {item.title}
                  <span className="wsa-item__sub">{item.kind}</span>
                </span>
                <span className="wsa-item__meta">
                  <span
                    className={
                      item.health === 'no-update'
                        ? 'wsa-item__chip'
                        : 'wsa-item__chip wsa-item__chip--warn'
                    }
                  >
                    {healthLabel(item.health === 'no-update' ? null : item.health)}
                  </span>
                </span>
              </UnstyledButton>
            );
          })}

          {staleKrs.length > 0 && (
            <>
              <div className="wsa-sub">
                <span className="wsa-sub__label">
                  Need a check-in this week
                  <span className="wsa-sub__badge">{staleKrs.length}</span>
                </span>
              </div>
              {staleKrs.map((kr) => (
                <UnstyledButton
                  key={kr.id}
                  component={Link}
                  href={`/w/${workspaceSlug}/goals?tab=okrs&drawer=${encodeURIComponent(`keyResult:${kr.id}`)}`}
                  className="wsa-item"
                >
                  <span className="wsa-item__icon">
                    <IconTrendingUp size={14} stroke={1.75} />
                  </span>
                  <span className="wsa-item__label">{kr.title}</span>
                  <span className="wsa-item__meta">
                    {kr.lastCheckIn
                      ? `last check-in ${compactAge(kr.lastCheckIn)} ago`
                      : 'never checked in'}
                  </span>
                </UnstyledButton>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
