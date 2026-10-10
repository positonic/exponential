'use client';

import { Container } from '@mantine/core';
import { Heatmap } from '~/app/_components/home/activity/Heatmap';
import { WeekInReview } from '~/app/_components/home/activity/WeekInReview';
import { WorkspaceActivityFullFeed } from '~/app/_components/home/activity/WorkspaceActivityFullFeed';
// The wsa-week / wsa-heatmap / wsa-analytics rules live here. FullFeed also
// imports it, but this page must not depend on that transitively.
import '~/app/_components/home/activity/activity-home.css';

/**
 * `/w/[workspaceSlug]/activity` — the workspace's activity destination:
 * week-in-review and contribution heatmap up top (relocated from the home
 * page, where weekly-cadence charts fought with the daily tiers), then the
 * full paginated `WorkspaceActivityEvent` history. Reached from the home
 * page's "Since yesterday" digest line and "All activity" CTAs.
 *
 * The `activity-layout` wrapper is required: the `--activity-*` tokens these
 * cards consume are scoped to it in globals.css.
 */
export default function WorkspaceActivityPage() {
  return (
    <div className="activity-layout flex h-full flex-col text-text-primary">
      <Container size="md" className="w-full pt-8">
        <div className="wsa-analytics">
          <WeekInReview />
          <Heatmap />
        </div>
      </Container>
      <WorkspaceActivityFullFeed />
    </div>
  );
}
