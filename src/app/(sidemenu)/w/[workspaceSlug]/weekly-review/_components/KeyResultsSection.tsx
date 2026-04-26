"use client";

import { useMemo } from "react";
import { Loader, Tooltip } from "@mantine/core";
import { IconCheck, IconPlus, IconTarget } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { LinkKeyResultPopover } from "./LinkKeyResultPopover";

type ProjectWithDetails = RouterOutputs["project"]["getActiveWithDetails"][number];
type KeyResultDetail = RouterOutputs["okr"]["getByIds"][number];

interface KeyResultsSectionProps {
  project: ProjectWithDetails;
  workspaceId: string | null;
  workspaceName: string | null;
  /** Called after a link/unlink so parent can refetch project data. */
  onLinksChanged: () => void;
}

function getCurrentQuarter(now: Date): {
  label: string;
  shortLabel: string;
  start: Date;
  end: Date;
} {
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  const year = now.getFullYear();
  const start = new Date(year, (quarter - 1) * 3, 1);
  const end = new Date(year, quarter * 3, 0, 23, 59, 59, 999);
  return {
    label: `Q${quarter} ${year}`,
    shortLabel: `Q${quarter}`,
    start,
    end,
  };
}

function computeProgressPct(kr: KeyResultDetail): number {
  const range = kr.targetValue - kr.startValue;
  if (range === 0) return 0;
  const pct = ((kr.currentValue - kr.startValue) / range) * 100;
  return Math.min(Math.max(pct, 0), 100);
}

function statusPillClass(status: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case "achieved":
      return {
        label: "ahead",
        className: "bg-green-500/10 text-green-500",
      };
    case "on-track":
      return {
        label: "on pace",
        className: "bg-green-500/10 text-green-500",
      };
    case "at-risk":
      return {
        label: "at risk",
        className: "bg-yellow-500/10 text-yellow-500",
      };
    case "off-track":
      return {
        label: "off track",
        className: "bg-red-500/10 text-red-500",
      };
    default:
      return {
        label: "—",
        className: "bg-surface-hover text-text-muted",
      };
  }
}

function progressBarColor(status: string | null | undefined): string {
  switch (status) {
    case "achieved":
    case "on-track":
      return "bg-green-500";
    case "at-risk":
      return "bg-yellow-500";
    case "off-track":
      return "bg-red-500";
    default:
      return "bg-blue-500";
  }
}

export function KeyResultsSection({
  project,
  workspaceId,
  workspaceName,
  onLinksChanged,
}: KeyResultsSectionProps) {
  const linkedKrIds = useMemo(
    () => project.keyResults.map((k) => k.keyResultId),
    [project.keyResults],
  );

  // Fetch detailed metrics for the linked KRs (currentValue/targetValue/status)
  const krDetailsQuery = api.okr.getByIds.useQuery(
    { ids: linkedKrIds },
    { enabled: linkedKrIds.length > 0 },
  );

  // Fetch ALL workspace KRs so we can show "N more in {workspace}" hint.
  const allWorkspaceKrsQuery = api.okr.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: workspaceId !== null },
  );

  const unlinkProject = api.okr.unlinkProject.useMutation();

  const quarter = useMemo(() => getCurrentQuarter(new Date()), []);
  const totalDays = Math.max(
    1,
    Math.round(
      (quarter.end.getTime() - quarter.start.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  const elapsedDays = Math.max(
    0,
    Math.round(
      (Date.now() - quarter.start.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  const daysLeft = Math.max(0, totalDays - elapsedDays);
  const elapsedPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

  // Synthesize KR codes by goal-display-order × position-in-goal.
  // The KR rows are grouped by goal, ordered by goal title.
  const codedKrs = useMemo(() => {
    const krs = krDetailsQuery.data ?? [];
    if (krs.length === 0) return [];

    const goalIndex = new Map<number, number>();
    const sortedByGoal = [...krs].sort((a, b) => {
      const aTitle = a.goal?.title ?? "";
      const bTitle = b.goal?.title ?? "";
      return aTitle.localeCompare(bTitle);
    });

    let nextGoalNum = 1;
    const positionInGoal = new Map<string, number>();
    for (const kr of sortedByGoal) {
      const goalId = kr.goalId;
      if (!goalIndex.has(goalId)) {
        goalIndex.set(goalId, nextGoalNum++);
      }
    }
    const goalCounters = new Map<number, number>();
    for (const kr of sortedByGoal) {
      const counter = (goalCounters.get(kr.goalId) ?? 0) + 1;
      goalCounters.set(kr.goalId, counter);
      positionInGoal.set(kr.id, counter);
    }

    return sortedByGoal.map((kr) => {
      const oNum = goalIndex.get(kr.goalId) ?? 0;
      const krNum = positionInGoal.get(kr.id) ?? 0;
      return {
        kr,
        objectiveCode: `O${oNum}`,
        krCode: `${oNum}.${krNum}`,
      };
    });
  }, [krDetailsQuery.data]);

  const moreInWorkspace = Math.max(
    0,
    (allWorkspaceKrsQuery.data?.length ?? 0) - linkedKrIds.length,
  );

  const handleUnlink = (krId: string) => {
    unlinkProject.mutate(
      { keyResultId: krId, projectId: project.id },
      {
        onSuccess: () => {
          void krDetailsQuery.refetch();
          onLinksChanged();
        },
      },
    );
  };

  return (
    <div className="rounded-md border border-border-primary bg-background-primary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
        <div className="flex items-center gap-2">
          <IconTarget size={14} className="text-text-muted" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Key Results · {quarter.label}
          </span>
        </div>
        <span className="text-xs text-text-muted">
          {linkedKrIds.length} linked
          {workspaceName ? ` · ${workspaceName} OKRs` : ""}
        </span>
      </div>

      {/* Quarter meta strip */}
      <div className="flex items-center justify-between border-b border-border-primary px-4 py-2">
        <span className="text-xs text-text-secondary">
          This quarter&apos;s bets ·{" "}
          <span className="text-yellow-500">{quarter.shortLabel}</span> ·{" "}
          {daysLeft} days left
        </span>
        <span className="text-xs text-text-muted">{elapsedPct}% elapsed</span>
      </div>

      {/* KR rows */}
      {krDetailsQuery.isLoading ? (
        <div className="flex justify-center p-6">
          <Loader size="sm" />
        </div>
      ) : codedKrs.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-text-muted">
          No key results linked to this project yet.
        </div>
      ) : (
        <div className="divide-y divide-border-primary">
          {codedKrs.map(({ kr, objectiveCode, krCode }) => {
            const pct = computeProgressPct(kr);
            const pill = statusPillClass(kr.status);
            const barColor = progressBarColor(kr.status);
            return (
              <div
                key={kr.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Tooltip label="Unlink this KR from the project" withArrow>
                  <button
                    type="button"
                    onClick={() => handleUnlink(kr.id)}
                    disabled={unlinkProject.isPending}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-blue-500 bg-blue-500 transition-opacity hover:opacity-80"
                    aria-label="Unlink"
                  >
                    <IconCheck size={12} className="text-white" />
                  </button>
                </Tooltip>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="font-mono text-xs text-text-muted">
                    KR {krCode}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text-primary">
                      {kr.title}
                    </div>
                    <div className="truncate text-xs text-text-muted">
                      Objective {objectiveCode}
                      {kr.goal?.title ? ` · ${kr.goal.title}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex w-48 items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className={"h-full transition-all " + barColor}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-text-primary">
                    {Math.round(pct)}%
                  </span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
                      pill.className
                    }
                  >
                    {pill.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link another KR */}
      <div className="border-t border-border-primary px-4 py-2">
        <LinkKeyResultPopover
          projectId={project.id}
          workspaceId={workspaceId}
          linkedKeyResultIds={linkedKrIds}
          onLinksChanged={() => {
            void krDetailsQuery.refetch();
            void allWorkspaceKrsQuery.refetch();
            onLinksChanged();
          }}
        >
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            <IconPlus size={12} /> Link another KR
            {moreInWorkspace > 0 && workspaceName
              ? ` · ${moreInWorkspace} more in ${workspaceName}`
              : ""}
          </button>
        </LinkKeyResultPopover>
      </div>
    </div>
  );
}
