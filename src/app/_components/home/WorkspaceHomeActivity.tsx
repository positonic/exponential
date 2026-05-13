'use client';

import { WorkspaceHomeActivityLayout } from './activity';

/**
 * Activity workspace home. The full layout (hero strip, week-in-review,
 * pickup, heatmap, activity feed, active-projects rail, projects panel)
 * lives under `./activity/`. This wrapper exists so the route-level switch in
 * `WorkspaceHome` can stay layout-agnostic.
 */
export function WorkspaceHomeActivity() {
  return <WorkspaceHomeActivityLayout />;
}
