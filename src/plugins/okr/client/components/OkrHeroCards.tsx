"use client";

import { useMemo } from "react";
import { Paper, Text, Tooltip } from "@mantine/core";
import { IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react";
import {
  clamp01,
  computeTrajectory,
  expectedProgress,
  periodCountdownLabel,
  statusToConfidence,
  type Confidence,
  type TrajectoryPoint,
} from "../utils/okrDashboardUtils";

type KrCheckIn = { newValue: number; createdAt: Date | string };

export interface HeroKeyResult {
  id: string;
  title: string;
  currentValue: number;
  startValue: number;
  targetValue: number;
  status: string;
  checkIns?: KrCheckIn[];
  user?: { id: string; name: string | null; email: string | null; image: string | null } | null;
  driUser?: { id: string; name: string | null; email: string | null; image: string | null } | null;
}

export interface HeroObjective {
  id: number;
  progress: number; // 0-100 (server-provided)
  keyResults: HeroKeyResult[];
}

interface OkrHeroCardsProps {
  objectives: HeroObjective[];
  period: string;
}

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  ok: "var(--color-brand-success)",
  warn: "var(--accent-okr)",
  bad: "var(--accent-due)",
  idle: "var(--color-text-muted)",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  ok: "On track",
  warn: "At risk",
  bad: "Off track",
  idle: "Not started",
};

function CardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper className="flex flex-col gap-3 border border-border-primary bg-surface-secondary p-5">
      <Text
        size="xs"
        fw={600}
        className="uppercase tracking-wider text-text-muted"
      >
        {title}
      </Text>
      {children}
    </Paper>
  );
}

/**
 * Card 1: QUARTER PROGRESS
 * big % · delta chip · expected-pace marker bar · pace gap + days left
 */
function QuarterProgressCard({
  avgFrac,
  expectedFrac,
  deltaFrac,
  period,
}: {
  avgFrac: number;
  expectedFrac: number;
  deltaFrac: number;
  period: string;
}) {
  const paceGapPts = Math.round((expectedFrac - avgFrac) * 100);
  const deltaPts = Math.round(deltaFrac * 100);
  const countdown = periodCountdownLabel(period);

  const paceText =
    paceGapPts > 0
      ? `${paceGapPts}pt behind expected pace`
      : paceGapPts < 0
        ? `${Math.abs(paceGapPts)}pt ahead of pace`
        : "on pace";

  return (
    <CardShell title="Quarter progress">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold leading-none tracking-tight tabular-nums text-text-primary">
            {Math.round(avgFrac * 100)}
          </span>
          <span className="text-base text-text-muted">%</span>
        </div>
        <div
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background:
              deltaPts < 0
                ? "var(--mantine-color-red-light)"
                : "var(--mantine-color-green-light)",
            color:
              deltaPts < 0
                ? "var(--color-brand-error)"
                : "var(--color-brand-success)",
          }}
        >
          {deltaPts < 0 ? (
            <IconArrowDownRight size={12} />
          ) : (
            <IconArrowUpRight size={12} />
          )}
          {deltaPts >= 0 ? "+" : ""}
          {deltaPts}pt wk
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-end">
          <span className="text-[11px] text-text-muted">
            expected {Math.round(expectedFrac * 100)}%
          </span>
        </div>
        <div className="relative h-1.5 overflow-visible rounded-full bg-surface-tertiary">
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${clamp01(avgFrac) * 100}%`,
              background:
                "linear-gradient(90deg, var(--color-brand-primary), var(--color-brand-success))",
            }}
          />
          <Tooltip label={`Expected ${Math.round(expectedFrac * 100)}%`}>
            <div
              className="absolute top-[-3px] bottom-[-3px] w-px bg-text-primary opacity-80"
              style={{ left: `${clamp01(expectedFrac) * 100}%` }}
            />
          </Tooltip>
        </div>
      </div>

      <Text size="xs" className="text-text-muted">
        {paceText}
        {countdown ? (
          <>
            <span className="mx-1.5 text-text-muted opacity-60">·</span>
            {countdown}
          </>
        ) : null}
      </Text>
    </CardShell>
  );
}

/**
 * Card 2: KEY RESULTS BY CONFIDENCE
 * big on-track count · 4 inline colored dots · summary caption
 */
function ConfidenceCard({
  counts,
  total,
}: {
  counts: Record<Confidence, number>;
  total: number;
}) {
  const captionParts: string[] = [];
  if (counts.bad > 0) captionParts.push(`${counts.bad} off-track`);
  if (counts.idle > 0) captionParts.push(`${counts.idle} not started`);
  if (captionParts.length === 0) captionParts.push("no KRs off-track");

  return (
    <CardShell title="Key results by confidence">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold leading-none tracking-tight tabular-nums text-text-primary">
          {counts.ok}
        </span>
        <span className="text-sm text-text-muted">
          / {total} on track
        </span>
      </div>

      <div className="flex items-center gap-3">
        {(["ok", "warn", "bad", "idle"] as Confidence[]).map((c) => (
          <Tooltip key={c} label={CONFIDENCE_LABEL[c]}>
            <div className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: CONFIDENCE_COLOR[c] }}
              />
              <span className="text-sm font-medium tabular-nums text-text-primary">
                {counts[c]}
              </span>
            </div>
          </Tooltip>
        ))}
      </div>

      <Text size="xs" className="text-text-muted">
        {captionParts.join(" · ")}
      </Text>
    </CardShell>
  );
}

/**
 * Card 3: CHECK-INS THIS WEEK
 * % of KRs with ≥1 check-in in last 7 days · progress bar · owners stale caption
 */
function CheckInsCard({
  updatedPct,
  staleOwnerCount,
}: {
  updatedPct: number;
  staleOwnerCount: number;
}) {
  return (
    <CardShell title="Check-ins this week">
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-semibold leading-none tracking-tight tabular-nums text-text-primary">
          {Math.round(updatedPct * 100)}
        </span>
        <span className="text-base text-text-muted">% updated</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamp01(updatedPct) * 100}%`,
            background:
              "linear-gradient(90deg, var(--color-brand-primary), var(--color-brand-success))",
          }}
        />
      </div>

      <Text size="xs" className="text-text-muted">
        {staleOwnerCount === 0
          ? "Everyone has checked in this week"
          : `${staleOwnerCount} owner${staleOwnerCount === 1 ? "" : "s"} haven't checked in in 7+ days`}
      </Text>
    </CardShell>
  );
}

/**
 * Card 4: TRAJECTORY
 * compact sparkline with actual / expected legend
 */
function TrajectoryCard({
  trajectory,
}: {
  trajectory: TrajectoryPoint[];
}) {
  const width = 240;
  const height = 80;

  const body =
    trajectory.length < 2 ? (
      <div
        className="grid place-items-center text-text-muted"
        style={{ height }}
      >
        <Text size="xs">No check-in history yet</Text>
      </div>
    ) : (
      (() => {
        const n = trajectory.length;
        const xStep = width / (n - 1);
        const yOf = (v: number) => height - clamp01(v) * height * 0.9 - 4;
        const toPath = (key: "actual" | "expected") =>
          trajectory
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"}${(i * xStep).toFixed(1)},${yOf(p[key]).toFixed(1)}`,
            )
            .join(" ");
        const actualPath = toPath("actual");
        const expectedPath = toPath("expected");
        const lastActual = trajectory[n - 1]?.actual ?? 0;
        const fillPath = `${actualPath} L${width},${height} L0,${height} Z`;
        return (
          <svg
            className="block w-full"
            style={{ height }}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="okr-traj-fill-compact"
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--color-brand-primary)"
                  stopOpacity="0.35"
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-brand-primary)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <path d={fillPath} fill="url(#okr-traj-fill-compact)" />
            <path
              d={expectedPath}
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
            <path
              d={actualPath}
              fill="none"
              stroke="var(--color-brand-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={(n - 1) * xStep}
              cy={yOf(lastActual)}
              r="3"
              fill="var(--color-brand-primary)"
            />
          </svg>
        );
      })()
    );

  return (
    <CardShell title="Trajectory">
      <div className="min-h-[80px]">{body}</div>
      <div className="flex items-center gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-brand-primary)" }}
          />
          actual
        </span>
        <span
          className="inline-block h-px w-px"
          aria-hidden
          style={{ background: "var(--color-text-faint)" }}
        />
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-3"
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--color-text-muted) 50%, transparent 50%)",
              backgroundSize: "4px 2px",
            }}
          />
          expected
        </span>
      </div>
    </CardShell>
  );
}

export function OkrHeroCards({ objectives, period }: OkrHeroCardsProps) {
  const stats = useMemo(() => {
    const allKrs = objectives.flatMap((o) => o.keyResults);
    const total = allKrs.length;

    const avgFrac =
      objectives.length > 0
        ? objectives.reduce((a, o) => a + o.progress, 0) / (100 * objectives.length)
        : 0;
    const expectedFrac = expectedProgress(period);
    const trajectory = computeTrajectory(allKrs, period);

    const last = trajectory[trajectory.length - 1]?.actual ?? avgFrac;
    const prev = trajectory[trajectory.length - 2]?.actual ?? 0;
    const deltaFrac = last - prev;

    const counts: Record<Confidence, number> = { ok: 0, warn: 0, bad: 0, idle: 0 };
    for (const kr of allKrs) counts[statusToConfidence(kr.status)] += 1;

    // Check-ins this week: KRs with ≥1 check-in in last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const updatedKrs = allKrs.filter((kr) =>
      (kr.checkIns ?? []).some(
        (c) => new Date(c.createdAt).getTime() >= sevenDaysAgo,
      ),
    ).length;
    const updatedPct = total > 0 ? updatedKrs / total : 0;

    // Stale owners: unique DRI users whose assigned KRs have no check-in in 7d
    const ownerActivity = new Map<string, boolean>(); // ownerId -> hasFreshCheckIn
    for (const kr of allKrs) {
      const owner = kr.driUser ?? kr.user;
      if (!owner) continue;
      const hasFresh = (kr.checkIns ?? []).some(
        (c) => new Date(c.createdAt).getTime() >= sevenDaysAgo,
      );
      // An owner is fresh if ANY of their KRs has a fresh check-in
      ownerActivity.set(
        owner.id,
        (ownerActivity.get(owner.id) ?? false) || hasFresh,
      );
    }
    let staleOwnerCount = 0;
    for (const fresh of ownerActivity.values()) {
      if (!fresh) staleOwnerCount += 1;
    }

    return {
      avgFrac,
      expectedFrac,
      deltaFrac,
      counts,
      total,
      updatedPct,
      staleOwnerCount,
      trajectory,
    };
  }, [objectives, period]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <QuarterProgressCard
        avgFrac={stats.avgFrac}
        expectedFrac={stats.expectedFrac}
        deltaFrac={stats.deltaFrac}
        period={period}
      />
      <ConfidenceCard counts={stats.counts} total={stats.total} />
      <CheckInsCard
        updatedPct={stats.updatedPct}
        staleOwnerCount={stats.staleOwnerCount}
      />
      <TrajectoryCard trajectory={stats.trajectory} />
    </div>
  );
}
