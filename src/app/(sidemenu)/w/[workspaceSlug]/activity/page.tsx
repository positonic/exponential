'use client';

import { WorkspaceActivityFullFeed } from '~/app/_components/home/activity/WorkspaceActivityFullFeed';

/**
 * `/w/[workspaceSlug]/activity` — the full paginated `WorkspaceActivityEvent`
 * history for the current workspace. Reached from the "All activity →" CTA
 * and "View older activity" footer in the home Activity feed card.
 */
export default function WorkspaceActivityPage() {
  return (
    <div className="flex h-full flex-col text-text-primary">
      <WorkspaceActivityFullFeed />
    </div>
  );
}
