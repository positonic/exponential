"use client";

import { useMemo, useState } from "react";
import { Badge, Table, Text, Tooltip } from "@mantine/core";
import {
  IconSelector,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { PriorityIcon } from "./PriorityIcon";

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
  _count?: { actions?: number; tickets?: number };
}

type SortField = "name" | "status" | "priority" | "tickets";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Sort header
// ---------------------------------------------------------------------------

function SortHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <Table.Th onClick={() => onSort(field)} className="cursor-pointer select-none hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {active ? (
          sortDir === "asc" ? <IconSortAscending size={14} className="text-text-muted" /> : <IconSortDescending size={14} className="text-text-muted" />
        ) : (
          <IconSelector size={14} className="text-text-muted opacity-40" />
        )}
      </div>
    </Table.Th>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EpicsList({
  epics,
  search,
  view = "table",
}: {
  epics: EpicRow[];
  search: string;
  basePath: string;
  view?: "table" | "list";
}) {
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
      <Text size="sm" className="text-text-muted py-8 text-center">
        {epics.length === 0 ? "No epics yet." : "No epics match your search."}
      </Text>
    );
  }

  // ── List view ──
  if (view === "list") {
    return (
      <div className="border border-border-primary rounded-lg overflow-hidden">
        {filtered.map((epic, i) => (
          <div
            key={epic.id}
            className={`flex items-center gap-3 px-3 py-2 hover:bg-surface-hover transition-colors ${i < filtered.length - 1 ? "border-b border-border-primary" : ""}`}
          >
            <Badge size="xs" variant="filled" color={EPIC_STATUS_COLORS[epic.status] ?? "gray"} styles={{ label: { color: "var(--mantine-color-dark-9)" } }} className="shrink-0">
              {EPIC_STATUS_LABELS[epic.status] ?? epic.status}
            </Badge>
            <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
              {epic.name}
            </Text>
            <PriorityIcon priority={PRIORITY_TO_NUM[epic.priority] ?? 4} size={14} />
            <Text size="xs" className="text-text-muted shrink-0">
              {epic._count?.tickets ?? 0} tickets
            </Text>
          </div>
        ))}
      </div>
    );
  }

  // ── Table view ──
  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      <Table
        highlightOnHover
        verticalSpacing={6}
        horizontalSpacing="md"
        styles={{
          table: { fontSize: "0.8rem" },
          th: { fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-primary)" },
          td: { borderBottom: "1px solid var(--color-border-primary)" },
          tr: { backgroundColor: "transparent" },
        }}
      >
        <Table.Thead>
          <Table.Tr>
            <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Tickets" field="tickets" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filtered.map((epic) => (
            <Table.Tr key={epic.id} className="hover:bg-surface-hover transition-colors">
              <Table.Td style={{ width: 110 }}>
                <Badge size="xs" variant="filled" color={EPIC_STATUS_COLORS[epic.status] ?? "gray"} styles={{ label: { color: "var(--mantine-color-dark-9)" } }}>
                  {EPIC_STATUS_LABELS[epic.status] ?? epic.status}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="sm" className="text-text-primary" lineClamp={1}>{epic.name}</Text>
              </Table.Td>
              <Table.Td style={{ width: 40 }}>
                <Tooltip label={epic.priority.toLowerCase()} position="top">
                  <div className="flex items-center justify-center">
                    <PriorityIcon priority={PRIORITY_TO_NUM[epic.priority] ?? 4} size={16} />
                  </div>
                </Tooltip>
              </Table.Td>
              <Table.Td style={{ width: 80 }}>
                <Text size="xs" className="text-text-secondary">{epic._count?.tickets ?? 0}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}
