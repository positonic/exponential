'use client';

import { ActiveProjects } from './ActiveProjects';
import { ActivityFeed } from './ActivityFeed';
import { GithubReposPanel } from './GithubReposPanel';
import { Heatmap } from './Heatmap';
import { Hero } from './Hero';
import { WeekInReview } from './WeekInReview';
import { WhatsAppGroupsPanel } from './WhatsAppGroupsPanel';
import './activity-home.css';

/**
 * Top-level layout for the Activity workspace home.
 *
 * Sections by area:
 *   `hero` — `Hero` (this-week / streak / active projects)
 *   `week` — `WeekInReview` (sparkline + multi-week stats)
 *   `main` — `Heatmap` + `ActivityFeed`
 *   `rail` — `ActiveProjects` + `GithubReposPanel` + `WhatsAppGroupsPanel`
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
        <div className="wsa__main">
          <Heatmap />
          <ActivityFeed />
        </div>
        <div className="wsa__rail">
          <ActiveProjects />
          <GithubReposPanel />
          <WhatsAppGroupsPanel />
        </div>
      </div>
    </div>
  );
}
