'use client';

import { CycleChangelogView } from '~/app/_components/changelog/CycleChangelogView';

/**
 * `/w/[workspaceSlug]/change-log` — what shipped in each cycle, grouped into
 * Features / Fixes and ordered from the largest piece of work to the smallest.
 *
 * Sibling of `/w/[workspaceSlug]/product-timeline`, which lists the same merged
 * PRs day by day; this page rolls them up per cycle alongside the cycle's
 * finished Tickets.
 */
export default function WorkspaceChangeLogPage() {
  return (
    <div className="flex h-full flex-col text-text-primary">
      <CycleChangelogView />
    </div>
  );
}
