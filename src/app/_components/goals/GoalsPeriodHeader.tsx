"use client";

import { Skeleton } from "@mantine/core";
import { IconTargetArrow } from "@tabler/icons-react";
import {
  periodCountdownLabel,
  periodStatus,
} from "~/plugins/okr/client/utils/okrDashboardUtils";
import {
  getPeriodDisplayName,
  type GoalsPagePeriod,
} from "~/plugins/okr/client/utils/periodUtils";

export interface GoalsPeriodStats {
  averageProgress: number;
  statusBreakdown: { onTrack: number; atRisk: number; offTrack: number; achieved: number };
}

interface GoalsPeriodHeaderProps {
  period: GoalsPagePeriod;
  year: string;
  /** `null` on All. */
  effectivePeriod: string | null;
  onlyMine: boolean;
  /** `okr.getStats` for the same scope; undefined while loading. */
  stats: GoalsPeriodStats | undefined;
  /** Plural noun from `useTerminology().goals` ("Goals" / "Objectives"). */
  goalsLabel: string;
  /**
   * The "reached X% of its KR targets" sentence. Off in workspaces that hide
   * OKR features, where a key result is not a concept.
   */
  showAttainment?: boolean;
  now?: Date;
}

/**
 * The Goals page's narrative header — eyebrow, title, attainment sentence and
 * countdown — rendered above every view. Copy is tense-aware so the header
 * reads correctly whether the period is upcoming, active or already ended,
 * and on All it narrates the selected year with no countdown.
 */
export function GoalsPeriodHeader({
  period,
  year,
  effectivePeriod,
  onlyMine,
  stats,
  goalsLabel,
  showAttainment = true,
  now = new Date(),
}: GoalsPeriodHeaderProps) {
  const isAll = period === "all";
  // On All the year is the narrated period; its tense drives the copy too.
  const narratedPeriod = effectivePeriod ?? `Annual-${year}`;
  const periodState = periodStatus(narratedPeriod, now);
  const isEnded = periodState === "ended";
  const isUpcoming = periodState === "upcoming";

  // "Annual-2026" is a year, not a quarter — both the noun ("this year") and
  // the ended-period label ("in 2026", never "in Annual") must reflect that.
  const isAnnual = isAll || period === "Annual";
  const periodNoun = isAnnual ? "year" : "quarter";
  const periodLabel = isAnnual ? year : period;

  const eyebrow = `${onlyMine ? "My " : ""}${goalsLabel} · ${
    isAll ? year : getPeriodDisplayName(narratedPeriod)
  }`;

  // All reads "in 2026" whatever the tense: it is a span, not "this year".
  const headerTitle = isEnded
    ? onlyMine
      ? `What I focused on in ${periodLabel}`
      : `What we bet on in ${periodLabel}`
    : isAll
      ? onlyMine
        ? `What I'm focused on in ${periodLabel}`
        : `What we're betting on in ${periodLabel}`
      : onlyMine
        ? `What I'm focused on this ${periodNoun}`
        : `What we're betting on this ${periodNoun}`;

  const progressLead = isEnded
    ? onlyMine
      ? `You finished the ${periodNoun} at `
      : `The team finished the ${periodNoun} at `
    : onlyMine
      ? "You've reached "
      : "The team has reached ";
  const progressTail = onlyMine ? " of your KR targets" : " of its KR targets";
  const atRiskCount = stats
    ? stats.statusBreakdown.atRisk + stats.statusBreakdown.offTrack
    : 0;
  const atRiskConnector = isEnded ? " — " : " with ";
  const atRiskLabel = isEnded
    ? `${atRiskCount} missed target`
    : `${atRiskCount} at risk`;
  const upcomingText = onlyMine
    ? `Your KRs for the ${periodNoun} are set`
    : `The team's KRs for the ${periodNoun} are set`;

  const countdown = isAll ? null : periodCountdownLabel(narratedPeriod, now);

  return (
    <div className="border-b border-border-primary pb-4" data-testid="goals-period-header">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--accent-okr)" }}
        />
        {eyebrow}
      </div>
      <h1 className="m-0 flex items-center gap-3 text-2xl font-semibold tracking-tight text-text-primary">
        <IconTargetArrow size={22} style={{ color: "var(--accent-okr)" }} />
        {headerTitle}
      </h1>
      {(showAttainment || countdown) && (
        <div className="mt-2 text-sm text-text-secondary">
          {showAttainment &&
            (isUpcoming ? (
              <>{upcomingText}.</>
            ) : !stats ? (
              <Skeleton height={14} width={260} display="inline-block" />
            ) : (
              <>
                {progressLead}
                <strong className="font-semibold text-text-primary">
                  {stats.averageProgress}%
                </strong>
                {progressTail}
                {atRiskCount > 0 ? (
                  <>
                    {atRiskConnector}
                    <span
                      className="font-medium"
                      style={{ color: "var(--color-brand-error)" }}
                    >
                      {atRiskLabel}
                    </span>
                    .
                  </>
                ) : (
                  "."
                )}
              </>
            ))}
          {countdown && (
            <span className={isEnded ? "text-brand-warning" : "text-text-muted"}>
              {showAttainment ? " · " : ""}
              {countdown}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
