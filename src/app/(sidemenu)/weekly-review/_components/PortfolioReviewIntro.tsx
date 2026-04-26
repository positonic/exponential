"use client";

import {
  IconArrowRight,
  IconClock,
  IconCompass,
  IconStar,
  IconTarget,
  IconBolt,
} from "@tabler/icons-react";
import { type ReviewData, quarterElapsedPct, daysBetween } from "./types";

interface Props {
  data: ReviewData;
  onStart: () => void;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function PortfolioReviewIntro({ data, onStart }: Props) {
  const now = new Date(data.now);
  const quarterStart = new Date(data.quarterStart);
  const quarterEnd = new Date(data.quarterEnd);
  const weekStart = new Date(data.weekStartDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const elapsedPct = quarterElapsedPct(now, quarterStart, quarterEnd);
  const daysLeftInQ = daysBetween(quarterEnd, now);

  // Aggregate KR confidence across all workspaces (proxied by Goal.health).
  const agg = data.quarterRollupByWorkspace.reduce(
    (acc, r) => {
      acc.onTrack += r.healthCounts.onTrack;
      acc.atRisk += r.healthCounts.atRisk;
      acc.offTrack += r.healthCounts.offTrack;
      acc.noUpdate += r.healthCounts.noUpdate;
      acc.objectives += r.okrCount;
      acc.projects += r.activeProjectCount;
      acc.dueActions += r.dueActions;
      return acc;
    },
    {
      onTrack: 0,
      atRisk: 0,
      offTrack: 0,
      noUpdate: 0,
      objectives: 0,
      projects: 0,
      dueActions: 0,
    },
  );
  const totalGoals =
    agg.onTrack + agg.atRisk + agg.offTrack + agg.noUpdate || 1;

  const suggestedFocus = data.lastWeekFocuses.filter((f) => f.isInFocus).length;

  // Week-of-year — Phase 4 mockup shows e.g. "WEEK 17"
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24) +
      startOfYear.getUTCDay() +
      1) /
      7,
  );

  const fmt = (d: Date) =>
    `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;

  return (
    <div className="pr-intro">
      <div className="pr-intro__icon">
        <IconCompass size={28} />
      </div>
      <div className="pr-intro__week">
        Week {weekNum} · {fmt(weekStart)} – {fmt(weekEnd)}, {now.getUTCFullYear()}
      </div>
      <h1 className="pr-intro__title">
        Set the week <em>across everything.</em>
      </h1>
      <p className="pr-intro__sub">
        Decide what matters, set a theme per workspace, and re-rank goals &
        projects in one bird&apos;s-eye pass — before you drill into any single
        workspace.
      </p>

      <div className="pr-intro__streak">
        <span className="pr-streak-item">
          <IconBolt size={14} style={{ color: "var(--pr-at-risk)" }} />
          <span className="pr-streak-item__num">{data.streak.currentStreak}</span>
          -week streak
        </span>
        <span className="pr-streak-divider" />
        <span className="pr-streak-item">
          <IconStar size={14} style={{ color: "var(--pr-brand-400)" }} />
          <span className="pr-streak-item__num">{data.streak.totalReviews}</span>
          {" "}portfolio reviews
        </span>
        <span className="pr-streak-divider" />
        <span className="pr-streak-item">
          <IconClock size={14} style={{ color: "var(--pr-text-muted)" }} />
          ~12 min
        </span>
      </div>

      {/* Quarter at a glance */}
      <div className="pr-quarter-glance">
        <div className="pr-quarter-glance__head">
          <span className="pr-quarter-glance__title">
            <IconTarget size={13} /> {data.currentQuarter} at a glance
          </span>
          <span>
            {elapsedPct}% through · {daysLeftInQ} days left
          </span>
        </div>
        <div className="pr-quarter-glance__body">
          <div className="pr-quarter-glance__col">
            <div className="pr-quarter-glance__label">
              KR confidence · {totalGoals} total
            </div>
            <ConfidenceStack counts={agg} total={totalGoals} />
            <ConfidenceLegend counts={agg} />
          </div>
          <div className="pr-quarter-glance__col">
            <div className="pr-quarter-glance__label">Quarter pace</div>
            <div className="pr-pace-bar">
              <div
                className="pr-pace-bar__fill"
                style={{ width: `${elapsedPct}%` }}
              />
              <div
                className="pr-pace-bar__expected"
                style={{ left: `${elapsedPct}%` }}
              />
            </div>
            <div className="pr-quarter-glance__sub">
              Aggregate progress vs expected pace
            </div>
          </div>
          {agg.offTrack > 0 || agg.noUpdate > 0 ? (
            <div className="pr-quarter-glance__col pr-quarter-glance__col--alert">
              <div className="pr-quarter-glance__alert-label pr-quarter-glance__label">
                Needs attention
              </div>
              <div className="pr-quarter-glance__alert-num">
                {agg.offTrack + agg.noUpdate}
              </div>
              <div className="pr-quarter-glance__sub">
                {agg.offTrack > 0
                  ? `${agg.offTrack} off track`
                  : `${agg.noUpdate} not updated`}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Stat strip */}
      <div className="pr-intro-stats">
        <div className="pr-intro-stat">
          <div className="pr-intro-stat__label">Workspaces</div>
          <div className="pr-intro-stat__value">{data.workspaces.length}</div>
          <div className="pr-intro-stat__meta">
            {suggestedFocus > 0
              ? `${suggestedFocus} in focus last week`
              : "first run"}
          </div>
        </div>
        <div className="pr-intro-stat">
          <div className="pr-intro-stat__label">Objectives</div>
          <div className="pr-intro-stat__value">{agg.objectives}</div>
          <div className="pr-intro-stat__meta">
            {totalGoals} key results in {data.currentQuarter}
          </div>
        </div>
        <div className="pr-intro-stat">
          <div className="pr-intro-stat__label">Projects</div>
          <div className="pr-intro-stat__value">{agg.projects}</div>
          <div className="pr-intro-stat__meta">across active workspaces</div>
        </div>
        <div className="pr-intro-stat">
          <div className="pr-intro-stat__label">Due actions</div>
          <div className="pr-intro-stat__value">{agg.dueActions}</div>
          <div className="pr-intro-stat__meta">awaiting attention</div>
        </div>
      </div>

      <button type="button" className="pr-intro__cta" onClick={onStart}>
        Start portfolio review <IconArrowRight size={16} />
      </button>
    </div>
  );
}

interface ConfidenceCounts {
  onTrack: number;
  atRisk: number;
  offTrack: number;
  noUpdate: number;
}

export function ConfidenceStack({
  counts,
  total,
}: {
  counts: ConfidenceCounts;
  total: number;
}) {
  const segs: Array<{ key: keyof ConfidenceCounts; cssVar: string }> = [
    { key: "onTrack", cssVar: "var(--pr-on-track)" },
    { key: "atRisk", cssVar: "var(--pr-at-risk)" },
    { key: "offTrack", cssVar: "var(--pr-off-track)" },
    { key: "noUpdate", cssVar: "var(--pr-no-update)" },
  ];
  return (
    <div className="pr-conf-stack">
      {segs
        .filter((s) => counts[s.key] > 0)
        .map((s) => (
          <div
            key={s.key}
            className="pr-conf-stack__seg"
            style={{
              background: s.cssVar,
              width: `${(counts[s.key] / total) * 100}%`,
            }}
          />
        ))}
    </div>
  );
}

const LEGEND_LABELS: Record<keyof ConfidenceCounts, string> = {
  onTrack: "on track",
  atRisk: "at risk",
  offTrack: "off track",
  noUpdate: "no update",
};

const LEGEND_VARS: Record<keyof ConfidenceCounts, string> = {
  onTrack: "var(--pr-on-track)",
  atRisk: "var(--pr-at-risk)",
  offTrack: "var(--pr-off-track)",
  noUpdate: "var(--pr-no-update)",
};

export function ConfidenceLegend({ counts }: { counts: ConfidenceCounts }) {
  const keys: Array<keyof ConfidenceCounts> = [
    "onTrack",
    "atRisk",
    "offTrack",
    "noUpdate",
  ];
  return (
    <div className="pr-conf-legend">
      {keys
        .filter((k) => counts[k] > 0)
        .map((k) => (
          <span key={k} className="pr-conf-legend__item">
            <span
              className="pr-conf-legend__dot"
              style={{ background: LEGEND_VARS[k] }}
            />
            {counts[k]} {LEGEND_LABELS[k]}
          </span>
        ))}
    </div>
  );
}
