"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import {
  IconDots,
  IconEdit,
  IconPencil,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { PriorityIcon } from "./PriorityIcon";
import { EditEpicModal } from "~/app/_components/EditEpicModal";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { ListPageChip } from "~/app/_components/listPage";
import table from "~/app/_components/listPage/DataTable.module.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EPIC_STATUS_COLORS: Record<string, string> = {
  OPEN: "gray",
  IN_PROGRESS: "blue",
  DONE: "green",
  CANCELLED: "dark",
};

const EPIC_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const EPIC_STATUS_ORDER: Record<string, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  DONE: 2,
  CANCELLED: 3,
};

// Same palette as the Projects page's priority pills (Epic priority shares its
// HIGH / MEDIUM / LOW / NONE scale).
const EPIC_PRIORITY_COLORS: Record<string, string> = {
  HIGH: "red",
  MEDIUM: "orange",
  LOW: "blue",
  NONE: "gray",
};

const EPIC_PRIORITY_LABELS: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "None",
};

const PRIORITY_TO_NUM: Record<string, number> = {
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NONE: 4,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EpicRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  /**
   * Null for epics created before epics became per-product. They surface on
   * every product board until someone assigns them, so they are flagged
   * rather than shown as if they belonged here.
   */
  product?: { id: string; name: string; slug: string } | null;
  _count?: { actions?: number; tickets?: number };
}

type SortField = "name" | "status" | "priority" | "tickets";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Sort header
// ---------------------------------------------------------------------------

function SortHeader({ label, field, sortField, sortDir, onSort, width }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void; width?: number;
}) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={table.sortable}
      style={width ? { width } : undefined}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span className={table.sortInner}>
        {label}
        {active ? (
          sortDir === "asc" ? <IconSortAscending size={13} /> : <IconSortDescending size={13} />
        ) : (
          <IconSelector size={13} className="opacity-40" />
        )}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EpicsList({
  epics,
  search,
  basePath,
  view = "table",
}: {
  epics: EpicRow[];
  search: string;
  basePath: string;
  view?: "table" | "list";
}) {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const [editEpicId, setEditEpicId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? epics.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            (e.description ?? "").toLowerCase().includes(q),
        )
      : [...epics];

    list.sort((a, b) => {
      let aVal: number;
      let bVal: number;
      switch (sortField) {
        case "name":
          aVal = a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
          bVal = 0;
          return sortDir === "asc" ? aVal : -aVal;
        case "status":
          aVal = EPIC_STATUS_ORDER[a.status] ?? 99;
          bVal = EPIC_STATUS_ORDER[b.status] ?? 99;
          break;
        case "priority":
          aVal = PRIORITY_TO_NUM[a.priority] ?? 99;
          bVal = PRIORITY_TO_NUM[b.priority] ?? 99;
          break;
        case "tickets":
          aVal = a._count?.tickets ?? 0;
          bVal = b._count?.tickets ?? 0;
          break;
      }
      const diff = aVal - bVal;
      return sortDir === "asc" ? diff : -diff;
    });

    return list;
  }, [epics, search, sortField, sortDir]);

  if (filtered.length === 0) {
    return (
      <div className={table.empty}>
        {epics.length === 0 ? "No epics yet." : "No epics match your search."}
      </div>
    );
  }

  const renderUnassignedBadge = (epic: EpicRow) =>
    epic.product ? null : (
      <Tooltip
        label="Not assigned to a product yet — open it to pick one"
        position="top"
      >
        <span className="shrink-0">
          <ListPageChip color="orange">Unassigned</ListPageChip>
        </span>
      </Tooltip>
    );

  const statusChip = (epic: EpicRow) => (
    <ListPageChip color={EPIC_STATUS_COLORS[epic.status] ?? "gray"}>
      {EPIC_STATUS_LABELS[epic.status] ?? epic.status}
    </ListPageChip>
  );

  const renderEditMenu = (epicId: string) => (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          className="shrink-0 text-text-muted hover:text-text-primary"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label="Epic actions"
        >
          <IconDots size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconPencil size={14} />}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            setEditEpicId(epicId);
          }}
        >
          Edit
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const modal = editEpicId ? (
    <EditEpicModal
      opened={editEpicId !== null}
      onClose={() => setEditEpicId(null)}
      epicId={editEpicId}
      workspaceId={workspaceId ?? undefined}
    />
  ) : null;

  // ── List view: DataTable's list variant, like Backlog › List ──
  if (view === "list") {
    return (
      <>
        <div className={table.list}>
          {filtered.map((epic) => (
            <div
              key={epic.id}
              className={table.listRow}
              onClick={() => router.push(`${basePath}/${epic.id}`)}
            >
              <span className="w-[124px] shrink-0">{statusChip(epic)}</span>
              <div className={table.listTitle}>
                <span className={`${table.nameText} min-w-0`}>{epic.name}</span>
                {renderUnassignedBadge(epic)}
              </div>
              <Tooltip label={EPIC_PRIORITY_LABELS[epic.priority] ?? epic.priority} withArrow>
                <span className="flex w-5 shrink-0 justify-center">
                  <PriorityIcon priority={PRIORITY_TO_NUM[epic.priority] ?? 4} size={16} />
                </span>
              </Tooltip>
              <span className={`${table.muted} w-[72px] shrink-0 text-right`}>
                {epic._count?.tickets ?? 0} tickets
              </span>
              {renderEditMenu(epic.id)}
            </div>
          ))}
        </div>
        {modal}
      </>
    );
  }

  // ── Table view ──
  return (
    <>
      <div className={table.tableWrap}>
        <table className={table.table}>
          <thead className={table.tableHead}>
            <tr>
              <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} width={150} />
              <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={handleSort} width={120} />
              <SortHeader label="Tickets" field="tickets" sortField={sortField} sortDir={sortDir} onSort={handleSort} width={100} />
              <th style={{ width: 72 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((epic) => (
              <tr
                key={epic.id}
                className={table.tableRow}
                data-clickable="true"
                onClick={() => router.push(`${basePath}/${epic.id}`)}
              >
                <td style={{ width: "100%", maxWidth: 0 }}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`${table.nameText} min-w-0`}>{epic.name}</span>
                    {renderUnassignedBadge(epic)}
                  </div>
                  {epic.description && (
                    <div className={`${table.nameSub} overflow-hidden text-ellipsis`}>{epic.description}</div>
                  )}
                </td>
                <td>{statusChip(epic)}</td>
                <td>
                  <ListPageChip color={EPIC_PRIORITY_COLORS[epic.priority] ?? "gray"}>
                    {EPIC_PRIORITY_LABELS[epic.priority] ?? epic.priority}
                  </ListPageChip>
                </td>
                <td>
                  <span className={table.muted}>{epic._count?.tickets ?? 0}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="flex text-text-muted hover:text-brand-primary"
                    aria-label="Edit epic"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditEpicId(epic.id);
                    }}
                  >
                    <IconEdit size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal}
    </>
  );
}
