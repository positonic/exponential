"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconHome,
  IconMoon,
  IconShare,
  IconTarget,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  workspaceGlyphVar,
  workspaceShortName,
  type ReviewData,
  type ReviewWorkspace,
} from "./types";

interface Props {
  data: ReviewData;
  focusedWorkspaces: ReviewWorkspace[];
  themes: Map<string, string | null>;
  focuses: Map<string, string[]>;
  priorityChanges: Map<string, { before: string; after: string }>;
  krCheckInsLogged: number;
  durationMinutes: number | null;
  /**
   * True when the user landed on this screen by resuming an already-completed
   * review (rather than by finishing the flow this session). When true, we do
   * NOT re-fire markComplete — it would reset the stored stats to zero.
   */
  resumedFromCompletion: boolean;
}

export function PortfolioReviewCompletion({
  data,
  focusedWorkspaces,
  themes,
  focuses,
  priorityChanges,
  krCheckInsLogged,
  durationMinutes,
  resumedFromCompletion,
}: Props) {
  const utils = api.useUtils();
  const hasMarkedComplete = useRef(false);

  const markComplete = api.portfolioReview.markComplete.useMutation({
    onSuccess: () => {
      void utils.portfolioReview.getStreak.invalidate();
      void utils.portfolioReview.isCompletedThisWeek.invalidate();
    },
  });

  const focusStatementsSet = Array.from(themes.values()).filter(
    (t) => t && t.trim().length > 0,
  ).length;
  const goalsReprioritized = Array.from(focuses.values()).reduce(
    (acc, arr) => acc + arr.length,
    0,
  );
  const projectsReprioritized = priorityChanges.size;

  useEffect(() => {
    if (hasMarkedComplete.current) return;
    if (resumedFromCompletion) return; // already complete in DB, don't re-fire
    hasMarkedComplete.current = true;
    markComplete.mutate({
      workspacesInFocus: focusedWorkspaces.length,
      krCheckInsLogged,
      goalsReprioritized,
      projectsReprioritized,
      focusStatementsSet,
      durationMinutes: durationMinutes ?? undefined,
    });
  }, [
    focusedWorkspaces.length,
    krCheckInsLogged,
    goalsReprioritized,
    projectsReprioritized,
    focusStatementsSet,
    durationMinutes,
    markComplete,
    resumedFromCompletion,
  ]);

  const streak = api.portfolioReview.getStreak.useQuery();
  const currentStreak = streak.data?.currentStreak ?? data.streak.currentStreak;

  return (
    <div className="pr-done">
      <div className="pr-done__seal">
        <IconCheck size={28} />
      </div>
      <h1 className="pr-done__title">Portfolio set for the week.</h1>
      <p className="pr-done__sub">
        {focusedWorkspaces.length} workspace
        {focusedWorkspaces.length === 1 ? "" : "s"} in focus ·{" "}
        {goalsReprioritized} KR{goalsReprioritized === 1 ? "" : "s"} in focus ·{" "}
        {projectsReprioritized} project priorit
        {projectsReprioritized === 1 ? "y" : "ies"} updated. Now drill into any
        workspace to handle individual project actions, or come back later.
      </p>

      <div className="pr-done__streak">
        <IconBolt size={14} style={{ color: "var(--pr-at-risk)" }} />
        Portfolio streak: <strong>{currentStreak} weeks</strong>
        <span style={{ width: 1, height: 14, background: "var(--pr-border-subtle)" }} />
        <IconMoon size={14} style={{ color: "var(--pr-brand-400)" }} />
        Next: <strong style={{ color: "var(--pr-text-primary)" }}>Mon 9:00</strong>
      </div>

      <div className="pr-drill-head">
        <div>
          <h2>Drill into a workspace</h2>
          <div className="pr-drill-head__sub">
            Optional. Each one opens the existing per-workspace weekly plan
            with project health, status, and next actions.
          </div>
        </div>
        <Link href="/home" className="pr-btn pr-btn--ghost">
          <IconHome size={13} /> Back to home
        </Link>
      </div>

      <div className="pr-drill-list">
        {focusedWorkspaces.map((ws) => {
          const idx = data.workspaces.findIndex((w) => w.id === ws.id);
          const rollup = data.quarterRollupByWorkspace.find(
            (r) => r.workspaceId === ws.id,
          );
          const theme = themes.get(ws.id);
          const top =
            rollup?.activeProjectCount ?? ws.counts.projects;
          return (
            <a
              key={ws.id}
              href={`/w/${ws.slug}/weekly-plan`}
              target="_blank"
              rel="noopener noreferrer"
              className="pr-drill"
            >
              <div
                className="pr-drill__glyph"
                style={{ background: workspaceGlyphVar(idx) }}
              >
                {workspaceShortName(ws.name)}
              </div>
              <div>
                <div className="pr-drill__name">{ws.name}</div>
                {theme && (
                  <div className="pr-drill__theme">
                    <IconTarget size={11} /> {theme}
                  </div>
                )}
              </div>
              <div className="pr-drill__count">
                {top} projects · {rollup?.dueActions ?? 0} due
              </div>
              <div className="pr-drill__cta">
                Start review <IconArrowRight size={13} />
              </div>
            </a>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 28,
          gap: 8,
        }}
      >
        <Link href="/home" className="pr-btn">
          <IconShare size={13} /> Done — back to home
        </Link>
      </div>
    </div>
  );
}
