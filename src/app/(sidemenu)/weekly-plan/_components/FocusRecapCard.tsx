"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconBolt,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { LinkProjectsPopover } from "./LinkProjectsPopover";
import {
  workspaceGlyphVar,
  type ReviewData,
  type ReviewWorkspace,
} from "./types";

export interface LinkedProjectLite {
  id: string;
  name: string;
}

interface Props {
  data: ReviewData;
  focusedWorkspaces: ReviewWorkspace[];
  /** Map of workspaceId → KR ids the user is focused on this week. */
  focuses: Map<string, string[]>;
  /** Map of focused KR id → number of in-list projects linked to it. */
  projectCountByKrId: Map<string, number>;
  /** Map of focused KR id → linked project objects (for inline pills). */
  linkedProjectsByKrId: Map<string, LinkedProjectLite[]>;
  /** Map of focused KR id → workspace id (so picker scopes correctly). */
  workspaceByKrId: Map<string, string>;
  /** Currently active filter mode (for highlighting selected focus). */
  activeFocusFilter: string | null;
  onSelectFocus: (krId: string | null) => void;
  /** Called after a successful link/unlink so parent can refetch. */
  onLinksChanged: () => void;
}

export function FocusRecapCard({
  data,
  focusedWorkspaces,
  focuses,
  projectCountByKrId,
  linkedProjectsByKrId,
  workspaceByKrId,
  activeFocusFilter,
  onSelectFocus,
  onLinksChanged,
}: Props) {
  const allFocusKrIds = useMemo(() => {
    const ids: string[] = [];
    for (const ws of focusedWorkspaces) {
      const wsFocuses = focuses.get(ws.id) ?? [];
      for (const id of wsFocuses) ids.push(id);
    }
    return ids;
  }, [focuses, focusedWorkspaces]);

  const krsQuery = api.okr.getByIds.useQuery(
    { ids: allFocusKrIds },
    { enabled: allFocusKrIds.length > 0 },
  );

  const updateLinkedProjects = api.okr.updateLinkedProjects.useMutation({
    onSuccess: () => {
      // Refetch both: the project list (drives pills + tier list) AND the
      // KR data (drives the popover's currentlyLinkedIds source-of-truth).
      void krsQuery.refetch();
      onLinksChanged();
    },
  });

  const [openPopoverKrId, setOpenPopoverKrId] = useState<string | null>(null);
  const [createModalKrId, setCreateModalKrId] = useState<string | null>(null);
  const popoverContainerRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click.
  useEffect(() => {
    if (!openPopoverKrId) return;
    const onDocClick = (e: MouseEvent) => {
      const node = popoverContainerRef.current;
      if (node && !node.contains(e.target as Node)) {
        setOpenPopoverKrId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openPopoverKrId]);

  // Source of truth for mutations: the FULL linked-project id set per KR
  // (includes archived/completed projects that don't appear in the active-only
  // tier list). Without this, full-replace mutations would silently drop them.
  const allLinkedIdsByKrId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const k of krsQuery.data ?? []) {
      map.set(k.id, k.projects.map((p) => p.projectId));
    }
    return map;
  }, [krsQuery.data]);

  // Workspace name lookup for the picker — built from the all-workspaces list
  // (not just focused) so cross-workspace project context renders correctly.
  const workspaceById = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const ws of data.workspaces) {
      map.set(ws.id, { id: ws.id, name: ws.name });
    }
    return map;
  }, [data.workspaces]);

  if (allFocusKrIds.length === 0) return null;

  const krById = new Map(
    (krsQuery.data ?? []).map((k) => [k.id, k] as const),
  );

  const handleLinkChange = (krId: string, newIds: string[]) => {
    updateLinkedProjects.mutate({ keyResultId: krId, projectIds: newIds });
  };

  const handleUnlink = (krId: string, projectId: string) => {
    const current = allLinkedIdsByKrId.get(krId) ?? [];
    handleLinkChange(
      krId,
      current.filter((id) => id !== projectId),
    );
  };

  const handleCreated = (krId: string, newProjectId: string) => {
    const current = allLinkedIdsByKrId.get(krId) ?? [];
    handleLinkChange(krId, [...current, newProjectId]);
    setCreateModalKrId(null);
  };

  return (
    <div className="pr-focus-recap" ref={popoverContainerRef}>
      <div className="pr-focus-recap__head">
        <span className="pr-focus-recap__icon">
          <IconBolt size={13} />
        </span>
        <span className="pr-focus-recap__title">Your focus this week</span>
        <span className="pr-focus-recap__count">
          {allFocusKrIds.length} KR{allFocusKrIds.length === 1 ? "" : "s"}
        </span>
        {activeFocusFilter && (
          <button
            type="button"
            className="pr-focus-recap__clear"
            onClick={() => onSelectFocus(null)}
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="pr-focus-recap__list">
        {focusedWorkspaces.map((ws) => {
          const wsFocuses = focuses.get(ws.id) ?? [];
          if (wsFocuses.length === 0) return null;
          const wsIdx = data.workspaces.findIndex((w) => w.id === ws.id);
          return (
            <div key={ws.id} className="pr-focus-recap__group">
              <div className="pr-focus-recap__ws">
                <span
                  className="pr-focus-recap__ws-dot"
                  style={{ background: workspaceGlyphVar(wsIdx) }}
                />
                <span className="pr-focus-recap__ws-name">{ws.name}</span>
              </div>
              {wsFocuses.map((krId) => {
                const kr = krById.get(krId);
                const linked = projectCountByKrId.get(krId) ?? 0;
                const linkedProjects = linkedProjectsByKrId.get(krId) ?? [];
                const isActive = activeFocusFilter === krId;
                const isPopoverOpen = openPopoverKrId === krId;
                const krWorkspaceId = workspaceByKrId.get(krId) ?? ws.id;
                const range =
                  kr && kr.targetValue - kr.startValue > 0
                    ? kr.targetValue - kr.startValue
                    : 0;
                const pct =
                  kr && range > 0
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          Math.round(
                            ((kr.currentValue - kr.startValue) / range) *
                              100,
                          ),
                        ),
                      )
                    : 0;
                const fillVar =
                  kr?.status === "off-track"
                    ? "var(--pr-off-track)"
                    : kr?.status === "at-risk"
                      ? "var(--pr-at-risk)"
                      : "var(--pr-on-track)";
                return (
                  <div
                    key={krId}
                    className={
                      isActive
                        ? "pr-focus-recap__row is-active"
                        : "pr-focus-recap__row"
                    }
                  >
                    <button
                      type="button"
                      className="pr-focus-recap__row-main-btn"
                      onClick={() => onSelectFocus(isActive ? null : krId)}
                      title={
                        linked > 0
                          ? `Filter project list to ${linked} project${linked === 1 ? "" : "s"} linked to this KR`
                          : "Click to filter (no projects linked yet)"
                      }
                    >
                      <div className="pr-focus-recap__obj">
                        {kr?.goal?.title ?? "Objective"}
                      </div>
                      <div className="pr-focus-recap__kr">
                        {krsQuery.isLoading
                          ? "Loading…"
                          : (kr?.title ?? "Key result not found")}
                      </div>
                    </button>
                    <div className="pr-focus-recap__progress">
                      <div className="pr-focus-recap__bar">
                        <div
                          className="pr-focus-recap__bar-fill"
                          style={{ width: `${pct}%`, background: fillVar }}
                        />
                      </div>
                      <span className="pr-focus-recap__pct">{pct}%</span>
                    </div>
                    <div className="pr-focus-recap__actions">
                      {linked === 0 ? (
                        <span className="pr-focus-recap__linked pr-focus-recap__linked--empty">
                          <IconAlertCircle size={11} /> 0 projects
                        </span>
                      ) : (
                        <div className="pr-focus-recap__projects">
                          {linkedProjects.map((p) => (
                            <span
                              key={p.id}
                              className="pr-focus-recap__project-pill"
                              title={`Unlink ${p.name} from this focus`}
                            >
                              <span className="pr-focus-recap__project-name">
                                {p.name}
                              </span>
                              <button
                                type="button"
                                className="pr-focus-recap__project-unlink"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnlink(krId, p.id);
                                }}
                                aria-label={`Unlink ${p.name}`}
                              >
                                <IconX size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="pr-focus-recap__add-wrap">
                        <button
                          type="button"
                          className="pr-focus-recap__add-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenPopoverKrId(
                              isPopoverOpen ? null : krId,
                            );
                          }}
                        >
                          <IconPlus size={11} /> Add project
                        </button>
                        {isPopoverOpen && (
                          <LinkProjectsPopover
                            krWorkspaceId={krWorkspaceId}
                            workspaceById={workspaceById}
                            currentlyLinkedIds={
                              allLinkedIdsByKrId.get(krId) ?? []
                            }
                            onLinkChange={(newIds) =>
                              handleLinkChange(krId, newIds)
                            }
                            onCreateNew={() => {
                              setCreateModalKrId(krId);
                              setOpenPopoverKrId(null);
                            }}
                            onClose={() => setOpenPopoverKrId(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {createModalKrId !== null && (
        <CreateProjectModalAutoOpen
          krId={createModalKrId}
          workspaceId={
            workspaceByKrId.get(createModalKrId) ?? focusedWorkspaces[0]?.id ?? ""
          }
          onClose={() => setCreateModalKrId(null)}
          onCreated={(projectId) =>
            handleCreated(createModalKrId, projectId)
          }
        />
      )}
    </div>
  );
}

/**
 * Wraps CreateProjectModal so it auto-opens when mounted. Lets the recap
 * card render the modal lazily only when the user clicks "Create new project".
 */
function CreateProjectModalAutoOpen({
  workspaceId,
  onClose,
  onCreated,
}: {
  krId: string;
  workspaceId: string;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    triggerRef.current?.click();
  }, []);

  return (
    <CreateProjectModal
      prefillWorkspaceId={workspaceId}
      onClose={onClose}
      onSuccess={(project) => onCreated(project.id)}
    >
      <span ref={triggerRef} style={{ display: "none" }} />
    </CreateProjectModal>
  );
}
