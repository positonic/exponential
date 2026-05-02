"use client";

import { useMemo, useState } from "react";
import { IconCheck, IconPlus, IconSearch } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface WorkspaceLite {
  id: string;
  name: string;
}

interface Props {
  /** The focused KR's workspace — projects in it sort first. */
  krWorkspaceId: string;
  /** Lookup table for displaying workspace names next to projects. */
  workspaceById: Map<string, WorkspaceLite>;
  /** Project ids currently linked to the focused KR. */
  currentlyLinkedIds: string[];
  /**
   * Called when user toggles a project. Receives the full new id list.
   * Caller is responsible for persisting via okr.updateLinkedProjects.
   */
  onLinkChange: (newIds: string[]) => void;
  /** Called when user clicks "Create new project". Caller opens the modal. */
  onCreateNew: () => void;
  /** Called when the user clicks outside or presses Escape. */
  onClose: () => void;
}

export function LinkProjectsPopover({
  krWorkspaceId,
  workspaceById,
  currentlyLinkedIds,
  onLinkChange,
  onCreateNew,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");

  // Fetch ALL the user's accessible projects, not just those in the KR's
  // workspace — users expect to see every project they own when linking.
  const projectsQuery = api.project.getAll.useQuery();

  const sorted = useMemo(() => {
    const all = projectsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    const matched = q
      ? all.filter((p) => p.name.toLowerCase().includes(q))
      : all;
    return [...matched].sort((a, b) => {
      const aSame = a.workspaceId === krWorkspaceId ? 0 : 1;
      const bSame = b.workspaceId === krWorkspaceId ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
      return a.name.localeCompare(b.name);
    });
  }, [projectsQuery.data, search, krWorkspaceId]);

  const linkedSet = new Set(currentlyLinkedIds);

  const toggle = (id: string) => {
    if (linkedSet.has(id)) {
      onLinkChange(currentlyLinkedIds.filter((x) => x !== id));
    } else {
      onLinkChange([...currentlyLinkedIds, id]);
    }
  };

  return (
    <div
      className="pr-focus-recap__popover"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="pr-focus-recap__popover-search">
        <IconSearch size={12} />
        <input
          type="text"
          className="pr-focus-recap__popover-input"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div className="pr-focus-recap__popover-list">
        {projectsQuery.isLoading ? (
          <div className="pr-focus-recap__popover-empty">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="pr-focus-recap__popover-empty">
            {search ? "No projects match" : "No projects yet"}
          </div>
        ) : (
          sorted.map((p) => {
            const isLinked = linkedSet.has(p.id);
            const ws = p.workspaceId
              ? workspaceById.get(p.workspaceId)
              : undefined;
            return (
              <button
                key={p.id}
                type="button"
                className={
                  isLinked
                    ? "pr-focus-recap__popover-item is-linked"
                    : "pr-focus-recap__popover-item"
                }
                onClick={() => toggle(p.id)}
              >
                <span className="pr-focus-recap__popover-check">
                  {isLinked && <IconCheck size={12} />}
                </span>
                <span className="pr-focus-recap__popover-name">{p.name}</span>
                {ws && (
                  <span className="pr-focus-recap__popover-ws">{ws.name}</span>
                )}
              </button>
            );
          })
        )}
      </div>

      <button
        type="button"
        className="pr-focus-recap__popover-create"
        onClick={onCreateNew}
      >
        <IconPlus size={12} /> Create new project
      </button>
    </div>
  );
}
