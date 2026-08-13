'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

type Group = { entityType: string; action: string; count: number };

/**
 * Turns the raw (entityType, action) counts into at most four human phrases,
 * most-to-least specific, with a "+n other updates" tail. The buckets are
 * deliberately coarse — this line is a periscope, not a feed.
 */
function summarize(groups: Group[]): string[] {
  let moved = 0;
  let created = 0;
  let completed = 0;
  let comments = 0;
  let checkins = 0;
  let meetings = 0;
  let other = 0;

  for (const g of groups) {
    if (g.entityType.endsWith('_comment') || g.action === 'commented') {
      comments += g.count;
    } else if (g.entityType === 'ticket' && g.action === 'status_changed') {
      moved += g.count;
    } else if (g.action === 'completed') {
      completed += g.count;
    } else if (g.action === 'checked_in' || g.entityType === 'okr_checkin') {
      checkins += g.count;
    } else if (g.entityType === 'meeting' || g.entityType === 'channel_summary') {
      meetings += g.count;
    } else if (g.action === 'created') {
      created += g.count;
    } else {
      other += g.count;
    }
  }

  const s = (n: number) => (n === 1 ? '' : 's');
  const phrases: string[] = [];
  if (moved > 0) phrases.push(`${moved} ticket move${s(moved)}`);
  if (completed > 0) phrases.push(`${completed} completion${s(completed)}`);
  if (created > 0) phrases.push(`${created} new item${s(created)}`);
  if (comments > 0) phrases.push(`${comments} comment${s(comments)}`);
  if (checkins > 0) phrases.push(`${checkins} check-in${s(checkins)}`);
  if (meetings > 0) phrases.push(`${meetings} meeting update${s(meetings)}`);
  if (other > 0) phrases.push(`${other} other update${s(other)}`);

  // At most four phrases; roll the overflow into the last slot.
  if (phrases.length > 4) {
    return [...phrases.slice(0, 3), 'and more'];
  }
  return phrases;
}

/**
 * One-line "since yesterday" team digest — what other people did in this
 * workspace while you were away, linking to the full feed at /activity. The
 * embedded feed this replaces was a firehose; the home page gets a periscope.
 * Hidden when nothing happened (a quiet workspace shouldn't announce it).
 */
export function SinceYesterdayLine() {
  const { workspaceId, workspaceSlug } = useWorkspace();

  // Start of yesterday in the viewer's timezone. Stable within a render
  // session — recomputing per render would churn the query key.
  const since = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d;
  }, []);

  const { data: groups } = api.yourWork.sinceYesterday.useQuery(
    { workspaceId: workspaceId ?? '', since },
    { enabled: !!workspaceId },
  );

  if (!workspaceId || !workspaceSlug || !groups) return null;

  const phrases = summarize(groups);
  if (phrases.length === 0) return null;

  return (
    <div className="wsa-sinceline">
      <span className="wsa-sinceline__text">
        Since yesterday: <b>{phrases.join(' · ')}</b>
      </span>
      <Link href={`/w/${workspaceSlug}/activity`} className="wsa-sinceline__link">
        All activity →
      </Link>
    </div>
  );
}
