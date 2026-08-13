'use client';

import { ActiveProjects } from './ActiveProjects';
import { AttentionPanel } from './AttentionPanel';
import { CycleCards } from './CycleCard';
import { GithubReposPanel } from './GithubReposPanel';
import { Hero } from './Hero';
import { OnTrackPanel } from './OnTrackPanel';
import { ResumptionStrip } from './ResumptionStrip';
import { SinceYesterdayLine } from './SinceYesterdayLine';
import { TodayPanel } from './TodayPanel';
import { WhatsAppGroupsPanel } from './WhatsAppGroupsPanel';
import './activity-home.css';

/**
 * Top-level layout for the Activity workspace home — the daily page, ordered
 * by the three questions a returning user asks:
 *
 *   1. What needs my attention?  — `AttentionPanel` (mentions, waiting-on-you,
 *      overdue). The only genuinely new content each day, so it leads.
 *   2. What am I committed to?   — `CycleCards` (current cycle + your tickets
 *      in it) and `TodayPanel` (due today/this week + out-of-cycle tickets).
 *   3. Is what I own on track?   — `OnTrackPanel` (DRI health chips +
 *      stale-check-in nudge), compressed to signals, not lists.
 *
 * Below the tiers: `SinceYesterdayLine` (one-line team digest linking to
 * /activity) and `ResumptionStrip` (recent pages/meetings). Every card hides
 * itself when empty, so the page shrinks as the day is processed.
 *
 * The weekly analytics that used to live here (`WeekInReview`, `Heatmap`,
 * the embedded `ActivityFeed`) moved to the /activity page — weekly-cadence
 * charts fight with daily content.
 */
export function WorkspaceHomeActivityLayout() {
  return (
    <div className="activity-layout">
      <div className="wsa">
        <div className="wsa__hero">
          <Hero />
        </div>
        <div className="wsa__main">
          <AttentionPanel />
          <CycleCards />
          <TodayPanel />
          <OnTrackPanel />
          <SinceYesterdayLine />
          <ResumptionStrip />
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
