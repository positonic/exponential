"use client";

import { useMemo, useState } from "react";
import { IconBolt, IconChevronUp } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { FocusRecapCard, type LinkedProjectLite } from "./FocusRecapCard";
import {
  workspaceGlyphVar,
  type ReviewData,
  type ReviewWorkspace,
} from "./types";

type ProjectPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";

interface FocusKrLite {
  id: string;
  title: string;
}

interface ProjectRow {
  id: string;
  name: string;
  workspaceId: string | null;
  priority: ProjectPriority;
  progress: number;
  actionCount: number;
  /** KR ids the user pinned this week that this project is linked to. */
  matchedFocusKrIds: string[];
  /** Focused KRs (id + title) this project is linked to — for inline display. */
  matchedFocusKrs: FocusKrLite[];
  /** All KR ids this project is linked to (for the "no KR" warning). */
  linkedKrIds: string[];
}

interface Props {
  data: ReviewData;
  focusedWorkspaces: ReviewWorkspace[];
  /** Map of workspaceId → KR ids the user is focused on this week. */
  focuses: Map<string, string[]>;
  onPriorityChange: (
    projectId: string,
    before: ProjectPriority,
    after: ProjectPriority,
  ) => void;
}

export function CrossWorkspaceProjectList({
  data,
  focusedWorkspaces,
  focuses,
  onPriorityChange,
}: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [focusFilter, setFocusFilter] = useState<string | null>(null);

  const projectsQuery = api.project.getActiveWithDetails.useQuery(
    {},
    { enabled: focusedWorkspaces.length > 0 },
  );

  const updatePriority = api.project.updatePriority.useMutation();

  const focusedIds = new Set(focusedWorkspaces.map((w) => w.id));
  // Flatten all focused KR ids across focused workspaces. Projects can link to
  // focuses in workspaces other than their own (allowed by the picker), so we
  // match against the full set, not just focuses in the project's workspace.
  const allFocusKrIdsSet = new Set<string>();
  for (const ws of focusedWorkspaces) {
    for (const id of focuses.get(ws.id) ?? []) allFocusKrIdsSet.add(id);
  }
  const projects: ProjectRow[] =
    projectsQuery.data
      ?.filter((p) => p.workspaceId && focusedIds.has(p.workspaceId))
      .map((p) => {
        const linkedKrIds = p.keyResults.map((k) => k.keyResultId);
        const matchedFocusKrIds = linkedKrIds.filter((id) =>
          allFocusKrIdsSet.has(id),
        );
        const matchedFocusKrs: FocusKrLite[] = p.keyResults
          .filter((k) => matchedFocusKrIds.includes(k.keyResultId))
          .map((k) => ({
            id: k.keyResultId,
            title: k.keyResult?.title ?? "Untitled KR",
          }));
        return {
          id: p.id,
          name: p.name,
          workspaceId: p.workspaceId,
          priority: p.priority as ProjectPriority,
          progress: p.progress ?? 0,
          actionCount: p.actions.length,
          matchedFocusKrIds,
          matchedFocusKrs,
          linkedKrIds,
        };
      }) ?? [];

  const wsFiltered =
    filter === "all" ? projects : projects.filter((p) => p.workspaceId === filter);
  const visible = focusFilter
    ? wsFiltered.filter((p) => p.matchedFocusKrIds.includes(focusFilter))
    : wsFiltered;

  // Count linked projects per focused KR (across the workspace-filtered list, ignoring
  // the focus filter itself so users see "real" counts in the recap).
  const projectCountByKrId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of wsFiltered) {
      for (const krId of p.matchedFocusKrIds) {
        counts.set(krId, (counts.get(krId) ?? 0) + 1);
      }
    }
    return counts;
  }, [wsFiltered]);

  // Build list of linked projects per focused KR for inline pills in the recap card.
  const linkedProjectsByKrId = useMemo(() => {
    const map = new Map<string, LinkedProjectLite[]>();
    for (const p of wsFiltered) {
      for (const krId of p.matchedFocusKrIds) {
        const list = map.get(krId) ?? [];
        list.push({ id: p.id, name: p.name });
        map.set(krId, list);
      }
    }
    return map;
  }, [wsFiltered]);

  // Resolve workspace per focused KR so the picker can scope project search.
  const workspaceByKrId = useMemo(() => {
    const map = new Map<string, string>();
    for (const ws of focusedWorkspaces) {
      for (const krId of focuses.get(ws.id) ?? []) {
        map.set(krId, ws.id);
      }
    }
    return map;
  }, [focuses, focusedWorkspaces]);

  // Focus-linked projects that aren't already at Top focus — these are the
  // ones the suggestion banner offers to promote.
  const focusLinkedNotTop = visible.filter(
    (p) => p.matchedFocusKrIds.length > 0 && p.priority !== "HIGH",
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

  const promoteAllFocusLinked = () => {
    for (const p of focusLinkedNotTop) {
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
      <FocusRecapCard
        data={data}
        focusedWorkspaces={focusedWorkspaces}
        focuses={focuses}
        projectCountByKrId={projectCountByKrId}
        linkedProjectsByKrId={linkedProjectsByKrId}
        workspaceByKrId={workspaceByKrId}
        activeFocusFilter={focusFilter}
        onSelectFocus={setFocusFilter}
        onLinksChanged={() => void projectsQuery.refetch()}
      />

      {focusLinkedNotTop.length > 0 && (
        <div className="pr-focus-banner">
          <div className="pr-focus-banner__icon">
            <IconBolt size={14} />
          </div>
          <div className="pr-focus-banner__text">
            <strong>
              {focusLinkedNotTop.length} project
              {focusLinkedNotTop.length === 1 ? "" : "s"} link to your focus
            </strong>{" "}
            but {focusLinkedNotTop.length === 1 ? "isn't" : "aren't"} in Top
            focus. Promote so the work matches what you said matters.
          </div>
          <button
            type="button"
            className="pr-focus-banner__cta"
            onClick={promoteAllFocusLinked}
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
            onClick={() => {
              setFilter("all");
              setFocusFilter(null);
            }}
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
                onClick={() => {
                  setFilter(ws.id);
                  setFocusFilter(null);
                }}
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
          // Sort focus-linked projects first within each tier.
          const items = visible
            .filter(tier.matches)
            .sort(
              (a, b) =>
                (b.matchedFocusKrIds.length > 0 ? 1 : 0) -
                (a.matchedFocusKrIds.length > 0 ? 1 : 0),
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
                    const isFocusLinked = p.matchedFocusKrIds.length > 0;
                    return (
                      <div
                        key={p.id}
                        className={
                          isFocusLinked
                            ? "pr-proj pr-proj--focus"
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
                            {isFocusLinked && (
                              <span
                                className="pr-focus-pip"
                                title={`Linked to ${p.matchedFocusKrIds.length} KR${p.matchedFocusKrIds.length === 1 ? "" : "s"} you're focused on this week`}
                              >
                                <IconBolt size={10} />
                                Focus
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
                            {isFocusLinked && p.matchedFocusKrs[0] && (
                              <span
                                className="pr-proj__focus-meta"
                                title={p.matchedFocusKrs
                                  .map((k) => k.title)
                                  .join(" · ")}
                              >
                                ↳ KR: {p.matchedFocusKrs[0].title}
                                {p.matchedFocusKrs.length > 1
                                  ? ` +${p.matchedFocusKrs.length - 1} more`
                                  : ""}
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
