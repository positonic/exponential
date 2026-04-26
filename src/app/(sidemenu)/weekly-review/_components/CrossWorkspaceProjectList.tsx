"use client";

import { useState } from "react";
import { IconBolt, IconChevronUp } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  workspaceGlyphVar,
  type ReviewData,
  type ReviewWorkspace,
} from "./types";

type ProjectPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";

interface ProjectRow {
  id: string;
  name: string;
  workspaceId: string | null;
  priority: ProjectPriority;
  progress: number;
  actionCount: number;
  /** KR ids the user pinned this week that this project is linked to. */
  matchedBetKrIds: string[];
  /** All KR ids this project is linked to (for the "no KR" warning). */
  linkedKrIds: string[];
}

interface Props {
  data: ReviewData;
  focusedWorkspaces: ReviewWorkspace[];
  /** Map of workspaceId → KR ids the user has bet on this week. */
  bets: Map<string, string[]>;
  onPriorityChange: (
    projectId: string,
    before: ProjectPriority,
    after: ProjectPriority,
  ) => void;
}

export function CrossWorkspaceProjectList({
  data,
  focusedWorkspaces,
  bets,
  onPriorityChange,
}: Props) {
  const [filter, setFilter] = useState<string>("all");

  const projectsQuery = api.project.getActiveWithDetails.useQuery(
    {},
    { enabled: focusedWorkspaces.length > 0 },
  );

  const updatePriority = api.project.updatePriority.useMutation();

  const focusedIds = new Set(focusedWorkspaces.map((w) => w.id));
  const projects: ProjectRow[] =
    projectsQuery.data
      ?.filter((p) => p.workspaceId && focusedIds.has(p.workspaceId))
      .map((p) => {
        const linkedKrIds = p.keyResults.map((k) => k.keyResultId);
        const wsBets = (p.workspaceId && bets.get(p.workspaceId)) || [];
        const matchedBetKrIds = linkedKrIds.filter((id) =>
          wsBets.includes(id),
        );
        return {
          id: p.id,
          name: p.name,
          workspaceId: p.workspaceId,
          priority: p.priority as ProjectPriority,
          progress: p.progress ?? 0,
          actionCount: p.actions.length,
          matchedBetKrIds,
          linkedKrIds,
        };
      }) ?? [];

  const visible =
    filter === "all" ? projects : projects.filter((p) => p.workspaceId === filter);

  // Bet-linked projects that aren't already at Top focus — these are the
  // ones the suggestion banner offers to promote.
  const betLinkedNotTop = visible.filter(
    (p) => p.matchedBetKrIds.length > 0 && p.priority !== "HIGH",
  );

  const tiers: Array<{
    key: "top" | "active" | "backlog";
    label: string;
    sub: string;
    cap: number | null;
    matches: (p: ProjectRow) => boolean;
    setsPriority: ProjectPriority;
  }> = [
    {
      key: "top",
      label: "Top focus",
      sub: "The 3–5 you'll actually move this week.",
      cap: 5,
      matches: (p) => p.priority === "HIGH",
      setsPriority: "HIGH",
    },
    {
      key: "active",
      label: "Active",
      sub: "Open & moving, but not the priority.",
      cap: null,
      matches: (p) => p.priority === "MEDIUM" || p.priority === "NONE",
      setsPriority: "MEDIUM",
    },
    {
      key: "backlog",
      label: "Backlog",
      sub: "Visible, parked, will not work this week.",
      cap: null,
      matches: (p) => p.priority === "LOW",
      setsPriority: "LOW",
    },
  ];

  const moveProject = (proj: ProjectRow, target: ProjectPriority) => {
    if (proj.priority === target) return;
    onPriorityChange(proj.id, proj.priority, target);
    updatePriority.mutate({ id: proj.id, priority: target });
    void projectsQuery.refetch();
  };

  const promoteAllBetLinked = () => {
    for (const p of betLinkedNotTop) {
      onPriorityChange(p.id, p.priority, "HIGH");
      updatePriority.mutate({ id: p.id, priority: "HIGH" });
    }
    void projectsQuery.refetch();
  };

  if (focusedWorkspaces.length === 0) {
    return (
      <div className="pr-empty">
        Pick at least one workspace in Phase 1 to see its projects here.
      </div>
    );
  }

  if (projectsQuery.isLoading) {
    return <div className="pr-empty">Loading projects…</div>;
  }

  return (
    <div>
      {betLinkedNotTop.length > 0 && (
        <div className="pr-bet-banner">
          <div className="pr-bet-banner__icon">
            <IconBolt size={14} />
          </div>
          <div className="pr-bet-banner__text">
            <strong>
              {betLinkedNotTop.length} project
              {betLinkedNotTop.length === 1 ? "" : "s"} link to your bets
            </strong>{" "}
            but {betLinkedNotTop.length === 1 ? "isn't" : "aren't"} in Top
            focus. Promote so the work matches what you said matters.
          </div>
          <button
            type="button"
            className="pr-bet-banner__cta"
            onClick={promoteAllBetLinked}
          >
            <IconChevronUp size={13} /> Promote all
          </button>
        </div>
      )}

      <div className="pr-x-toolbar">
        <div className="pr-x-filters">
          <button
            type="button"
            className={
              filter === "all"
                ? "pr-filter-chip is-active"
                : "pr-filter-chip"
            }
            onClick={() => setFilter("all")}
          >
            All workspaces
          </button>
          {focusedWorkspaces.map((ws) => {
            const idx = data.workspaces.findIndex((w) => w.id === ws.id);
            return (
              <button
                key={ws.id}
                type="button"
                className={
                  filter === ws.id
                    ? "pr-filter-chip is-active"
                    : "pr-filter-chip"
                }
                onClick={() => setFilter(ws.id)}
              >
                <span
                  className="pr-filter-chip__sw"
                  style={{ background: workspaceGlyphVar(idx) }}
                />
                {ws.name}
              </button>
            );
          })}
        </div>
        <div className="pr-x-counts">
          {visible.length} projects ·{" "}
          {visible.filter((p) => p.priority === "HIGH").length} top ·{" "}
          {
            visible.filter(
              (p) => p.priority === "MEDIUM" || p.priority === "NONE",
            ).length
          }{" "}
          active ·{" "}
          {visible.filter((p) => p.priority === "LOW").length} backlog
        </div>
      </div>

      <div className="pr-tier-list">
        {tiers.map((tier) => {
          // Sort bet-linked projects first within each tier.
          const items = visible
            .filter(tier.matches)
            .sort(
              (a, b) =>
                (b.matchedBetKrIds.length > 0 ? 1 : 0) -
                (a.matchedBetKrIds.length > 0 ? 1 : 0),
            );
          const overCap = tier.cap !== null && items.length > tier.cap;
          return (
            <div key={tier.key} className={`pr-tier pr-tier--${tier.key}`}>
              <div className="pr-tier__head">
                <div className="pr-tier__title">
                  <span className="pr-tier__bullet" />
                  {tier.label}
                  <span className="pr-tier__title-sub">· {tier.sub}</span>
                </div>
                <div
                  className={
                    overCap ? "pr-tier__cap pr-tier__cap--over" : "pr-tier__cap"
                  }
                >
                  <strong>{items.length}</strong>
                  {tier.cap !== null ? ` / ${tier.cap}` : ""}
                </div>
              </div>
              <div
                className={
                  items.length === 0
                    ? "pr-tier__body pr-tier__body--empty"
                    : "pr-tier__body"
                }
              >
                {items.length === 0 ? (
                  <span>No projects here</span>
                ) : (
                  items.map((p, i) => {
                    const wsIdx = data.workspaces.findIndex(
                      (w) => w.id === p.workspaceId,
                    );
                    const ws = data.workspaces.find(
                      (w) => w.id === p.workspaceId,
                    );
                    const isBetLinked = p.matchedBetKrIds.length > 0;
                    return (
                      <div
                        key={p.id}
                        className={
                          isBetLinked
                            ? "pr-proj pr-proj--bet"
                            : "pr-proj"
                        }
                      >
                        <div className="pr-proj__rank">{i + 1}</div>
                        <div
                          className="pr-proj__ws-bar"
                          style={{ background: workspaceGlyphVar(wsIdx) }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div className="pr-proj__name">
                            {p.name}
                            {isBetLinked && (
                              <span
                                className="pr-bet-pip"
                                title={`Linked to ${p.matchedBetKrIds.length} KR${p.matchedBetKrIds.length === 1 ? "" : "s"} you bet on this week`}
                              >
                                <IconBolt size={10} />
                                Bet
                              </span>
                            )}
                          </div>
                          <div className="pr-proj__sub">
                            <span
                              className="pr-proj__ws-label"
                              style={{ color: workspaceGlyphVar(wsIdx) }}
                            >
                              {ws?.name ?? "—"}
                            </span>
                            <span>{p.actionCount} open actions</span>
                            {isBetLinked && (
                              <span className="pr-proj__bet-meta">
                                → {p.matchedBetKrIds.length} pinned KR
                                {p.matchedBetKrIds.length === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="pr-proj__progress-text">
                          {Math.round(p.progress * 100)}%
                        </div>
                        <div className="pr-proj__move">
                          {tiers
                            .filter((t) => t.key !== tier.key)
                            .map((t) => (
                              <button
                                key={t.key}
                                type="button"
                                className="pr-proj-move-btn"
                                onClick={() => moveProject(p, t.setsPriority)}
                              >
                                {t.label.split(" ")[0]}
                              </button>
                            ))}
                        </div>
                        <div />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
