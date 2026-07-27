'use client';

import { AggregatedActivityFeed } from '~/app/_components/home/activity/AggregatedActivityFeed';

/**
 * `/activity` — the aggregated `WorkspaceActivityEvent` history across every
 * workspace the current user can see. The workspace-scoped equivalent lives at
 * `/w/[workspaceSlug]/activity`; this top-level page is the "all workspaces"
 * view, badging each row with its originating workspace.
 */
export default function AggregatedActivityPage() {
  return (
    <div className="flex h-full flex-col text-text-primary">
      <AggregatedActivityFeed />
    </div>
  );
}
