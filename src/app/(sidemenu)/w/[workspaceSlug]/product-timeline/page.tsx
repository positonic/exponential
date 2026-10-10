'use client';

import { WorkspaceShippingTimeline } from '~/app/_components/home/WorkspaceShippingTimeline';

/**
 * `/w/[workspaceSlug]/product-timeline` — the per-workspace sibling of the
 * public `/product-timeline` changelog. Same idea, but scoped to one workspace,
 * spanning every repo it tracks, and read from stored GitHub activity rather
 * than a live GitHub API call.
 *
 * Note the sibling route `/w/[workspaceSlug]/timeline` is the *projects* Gantt
 * view and is unrelated.
 */
export default function WorkspaceProductTimelinePage() {
  return (
    <div className="flex h-full flex-col text-text-primary">
      <WorkspaceShippingTimeline />
    </div>
  );
}
