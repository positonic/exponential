'use client';

import { ActiveProjects } from './ActiveProjects';
import { ActivityFeed } from './ActivityFeed';
import { Heatmap } from './Heatmap';
import { Hero } from './Hero';
import { PickUp } from './PickUp';
import { ProjectsPanel } from './ProjectsPanel';
import { WeekInReview } from './WeekInReview';
import './activity-home.css';

/**
 * Top-level layout for the Activity workspace home. Wraps the grid in
 * `.activity-layout` so the scoped CSS tokens in `globals.css` apply, then
 * `.wsa` to attach the feature stylesheet.
 *
 * Sections by area:
 *   `hero`   — `Hero` (real data: this-week / streak / active projects)
 *   `week`   — `WeekInReview` (skeleton; real data in slice 6)
 *   `pickup` — `PickUp` (skeleton)
 *   `main`   — `Heatmap` + `ActivityFeed` (skeletons)
 *   `rail`   — `ActiveProjects` + `ProjectsPanel` (real data)
 */
export function WorkspaceHomeActivityLayout() {
  return (
    <div className="activity-layout">
      <div className="wsa">
        <div className="wsa__hero">
          <Hero />
        </div>
        <div className="wsa__week">
          <WeekInReview />
        </div>
        <div className="wsa__pickup">
          <PickUp />
        </div>
        <div className="wsa__main">
          <Heatmap />
          <ActivityFeed />
        </div>
        <div className="wsa__rail">
          <ActiveProjects />
          <ProjectsPanel />
        </div>
      </div>
    </div>
  );
}
