"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Menu,
  Popover,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconAdjustments,
  IconChevronDown,
  IconChevronRight,
  IconFilter,
  IconLayoutColumns,
  IconLayoutList,
  IconList,
  IconPlus,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
  IconTicket,
} from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { CreateTicketModal } from "~/app/_components/product/CreateTicketModal";
import { generateLinearId } from "~/lib/fun-ids";
import { TicketKanbanBoard } from "~/app/_components/product/TicketKanbanBoard";
import { PriorityIcon, PRIORITY_LABELS as PRIORITY_LABEL_MAP } from "~/app/_components/product/PriorityIcon";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_ORDER,
  TICKET_STATUSES,
  COMPLETED_STATUSES,
  type TicketStatus,
} from "~/lib/ticket-statuses";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_STATUSES = TICKET_STATUSES.map((s) => s.value);

const PRIORITY_LABELS = PRIORITY_LABEL_MAP;

const TYPE_COLORS: Record<string, string> = {
  BUG: "red", FEATURE: "blue", CHORE: "gray", IMPROVEMENT: "teal", SPIKE: "violet", RESEARCH: "yellow",
};


// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type SortField = "status" | "title" | "priority" | "assignee" | "type" | "epic" | "cycle";
type SortDir = "asc" | "desc";

function cmp(a: string | number, b: string | number, dir: SortDir) {
  if (a < b) return dir === "asc" ? -1 : 1;
  if (a > b) return dir === "asc" ? 1 : -1;
  return 0;
}

function sortValue(t: Record<string, unknown>, field: SortField): string | number {
  switch (field) {
    case "status": return STATUS_ORDER[(t.status as string) ?? ""] ?? 99;
    case "title": return ((t.title as string) ?? "").toLowerCase();
    case "priority": return (t.priority as number) ?? 99;
    case "assignee": return ((t.assignee as { name?: string } | null)?.name ?? "zzz").toLowerCase();
    case "type": return (t.type as string) ?? "";
    case "epic": return ((t.epic as { name?: string } | null)?.name ?? "zzz").toLowerCase();
    case "cycle": return ((t.cycle as { name?: string } | null)?.name ?? "zzz").toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Group by
// ---------------------------------------------------------------------------

type GroupByField = "none" | "status" | "priority" | "cycle" | "epic" | "type" | "assignee";

const GROUP_BY_OPTIONS = [
  { value: "none", label: "No grouping" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "cycle", label: "Cycle" },
  { value: "epic", label: "Epic" },
  { value: "type", label: "Label" },
  { value: "assignee", label: "DRI" },
];

function groupKey(t: Record<string, unknown>, field: GroupByField): string {
  switch (field) {
    case "status": return (t.status as string) ?? "UNKNOWN";
    case "priority": return t.priority != null ? String(t.priority as number) : "unset";
    case "cycle": return (t.cycle as { name?: string } | null)?.name ?? "No cycle";
    case "epic": return (t.epic as { name?: string } | null)?.name ?? "No epic";
    case "type": return (t.type as string) ?? "UNKNOWN";
    case "assignee": return (t.assignee as { name?: string } | null)?.name ?? "Unassigned";
    default: return "all";
  }
}

function groupLabel(key: string, field: GroupByField): string {
  if (field === "status") return STATUS_LABELS[key] ?? key;
  if (field === "priority") {
    if (key === "unset") return "No priority";
    return PRIORITY_LABELS[Number(key)] ?? key;
  }
  return key;
}

// ---------------------------------------------------------------------------
// SortHeader
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
// Inline status selector
// ---------------------------------------------------------------------------

function StatusCell({ status, onUpdate }: { status: string; onUpdate: (s: TicketStatus) => void }) {
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <Badge
          size="xs"
          variant="filled"
          color={STATUS_COLORS[status] ?? "gray"}
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {STATUS_LABELS[status] ?? status}
        </Badge>
      </Menu.Target>
      <Menu.Dropdown>
        {ALL_STATUSES.map((s) => (
          <Menu.Item
            key={s}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onUpdate(s);
            }}
          >
            <div className="flex items-center gap-2">
              <Badge size="xs" variant="filled" color={STATUS_COLORS[s] ?? "gray"} />
              {STATUS_LABELS[s]}
            </div>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TicketsBacklogPage() {
  const params = useParams();
  const router = useRouter();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [modalOpened, setModalOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState("table");
  const [groupBy, setGroupBy] = useState<GroupByField>("none");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(["id", "status", "title", "priority", "dri", "label", "epic", "cycle"]),
  );
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // ── Load & save view preferences ──
  const { data: savedPrefs } = api.product.product.getViewPrefs.useQuery(
    { productSlug, workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const savePrefs = api.product.product.saveViewPrefs.useMutation();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback((prefs: Record<string, unknown>) => {
    if (!workspaceId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePrefs.mutate({ productSlug, workspaceId, prefs: prefs as { view?: string; groupBy?: string; sortField?: string; sortDir?: string; visibleColumns?: string[] } });
    }, 500);
  }, [workspaceId, productSlug, savePrefs]);

  // Restore prefs on load
  useEffect(() => {
    if (savedPrefs && !prefsLoaded) {
      if (savedPrefs.view) setView(savedPrefs.view as string);
      if (savedPrefs.groupBy) setGroupBy(savedPrefs.groupBy as GroupByField);
      if (savedPrefs.sortField) setSortField(savedPrefs.sortField as SortField);
      if (savedPrefs.sortDir) setSortDir(savedPrefs.sortDir as SortDir);
      if (savedPrefs.visibleColumns) setVisibleColumns(new Set(savedPrefs.visibleColumns as string[]));
      setPrefsLoaded(true);
    }
  }, [savedPrefs, prefsLoaded]);

  const toggleColumn = (col: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (col === "title") return next;
      if (next.has(col)) next.delete(col);
      else next.add(col);
      const arr = Array.from(next);
      debouncedSave({ visibleColumns: arr });
      return next;
    });
  };

  const COLUMN_OPTIONS = [
    { key: "id", label: "ID" },
    { key: "status", label: "Status" },
    { key: "title", label: "Title", locked: true },
    { key: "priority", label: "Priority" },
    { key: "dri", label: "DRI" },
    { key: "label", label: "Label" },
    { key: "epic", label: "Epic" },
    { key: "cycle", label: "Cycle" },
  ];

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: tickets, isLoading } = api.product.ticket.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const { data: epics } = api.epic.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const utils = api.useUtils();

  const updateTicket = api.product.ticket.update.useMutation({
    onSuccess: async () => {
      if (product?.id) {
        await utils.product.ticket.list.invalidate({ productId: product.id });
      }
    },
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      const newDir = sortDir === "asc" ? "desc" : "asc";
      setSortDir(newDir);
      debouncedSave({ sortField: field, sortDir: newDir });
    } else {
      setSortField(field);
      setSortDir("asc");
      debouncedSave({ sortField: field, sortDir: "asc" });
    }
  };

  const handleStatusChange = (ticketId: string, newStatus: TicketStatus) => {
    updateTicket.mutate({ id: ticketId, status: newStatus });
  };

  // Filter + sort
  const sorted = useMemo(() => {
    if (!tickets) return [];
    const q = search.toLowerCase().trim();
    const list = q
      ? tickets.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.type.toLowerCase().includes(q) ||
            (t.assignee?.name ?? "").toLowerCase().includes(q),
        )
      : [...tickets];
    list.sort((a, b) =>
      cmp(
        sortValue(a as unknown as Record<string, unknown>, sortField),
        sortValue(b as unknown as Record<string, unknown>, sortField),
        sortDir,
      ),
    );
    return list;
  }, [tickets, search, sortField, sortDir]);

  // Split completed tickets from active
  const { active: activeTickets, completed: completedTickets } = useMemo(() => {
    const active: typeof sorted = [];
    const completed: typeof sorted = [];
    for (const t of sorted) {
      if (COMPLETED_STATUSES.has(t.status)) {
        completed.push(t);
      } else {
        active.push(t);
      }
    }
    return { active, completed };
  }, [sorted]);

  // Group active tickets
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", items: activeTickets }];
    const map = new Map<string, typeof activeTickets>();
    for (const t of activeTickets) {
      const k = groupKey(t as unknown as Record<string, unknown>, groupBy);
      const arr = map.get(k);
      if (arr) arr.push(t);
      else map.set(k, [t]);
    }
    const result = Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: groupLabel(key, groupBy),
      items,
    }));

    // Smart cycle ordering: ACTIVE first, then PLANNED by startDate, then "No cycle"
    if (groupBy === "cycle") {
      const cycleStatusOrder: Record<string, number> = { ACTIVE: 0, PLANNED: 1, COMPLETED: 2, ARCHIVED: 3 };
      result.sort((a, b) => {
        if (a.key === "No cycle") return 1;
        if (b.key === "No cycle") return -1;
        // Find cycle data from any ticket in the group
        const aCycle = a.items[0]?.cycle;
        const bCycle = b.items[0]?.cycle;
        const aStatus = cycleStatusOrder[aCycle?.status ?? ""] ?? 99;
        const bStatus = cycleStatusOrder[bCycle?.status ?? ""] ?? 99;
        if (aStatus !== bStatus) return aStatus - bStatus;
        // Same status: sort by startDate ascending
        const aStart = aCycle?.startDate ? new Date(aCycle.startDate).getTime() : Infinity;
        const bStart = bCycle?.startDate ? new Date(bCycle.startDate).getTime() : Infinity;
        return aStart - bStart;
      });
    }

    return result;
  }, [activeTickets, groupBy]);

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/tickets`;

  // List item renderer (compact, no table)
  const renderListItem = (ticket: (typeof sorted)[number]) => (
    <div
      key={ticket.id}
      className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover transition-colors cursor-pointer border-b border-border-primary"
      onClick={() => router.push(`${basePath}/${ticket.id}`)}
    >
      <Text size="xs" className="text-text-muted font-mono w-14 shrink-0" lineClamp={1}>
        {product?.funTicketIds && ticket.shortId ? ticket.shortId : (ticket.number > 0 && product ? generateLinearId(product.name, ticket.number) : null)}
      </Text>
      <Badge size="xs" variant="filled" color={STATUS_COLORS[ticket.status] ?? "gray"} className="shrink-0">
        {STATUS_LABELS[ticket.status] ?? ticket.status}
      </Badge>
      <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
        {ticket.title}
      </Text>
      <div className="shrink-0">
        <PriorityIcon priority={ticket.priority} size={14} />
      </div>
      {ticket.assignee && (
        <Avatar size="xs" radius="xl" src={ticket.assignee.image} className="shrink-0">
          {(ticket.assignee.name ?? "?")[0]?.toUpperCase()}
        </Avatar>
      )}
      <Badge size="xs" variant="light" color={TYPE_COLORS[ticket.type] ?? "gray"} className="shrink-0">
        {ticket.type.toLowerCase()}
      </Badge>
    </div>
  );

  const vc = visibleColumns;
  const colCount = vc.size;

  // Shared row renderer
  const renderRow = (ticket: (typeof sorted)[number]) => (
    <Table.Tr
      key={ticket.id}
      className="cursor-pointer hover:bg-surface-hover transition-colors"
      onClick={() => router.push(`${basePath}/${ticket.id}`)}
    >
      {vc.has("id") && (
        <Table.Td style={{ width: 70 }}>
          <Text size="xs" className="text-text-muted font-mono" lineClamp={1}>
            {product?.funTicketIds && ticket.shortId ? ticket.shortId : (ticket.number > 0 && product ? generateLinearId(product.name, ticket.number) : null)}
          </Text>
        </Table.Td>
      )}
      {vc.has("status") && (
        <Table.Td style={{ width: 110 }}>
          <StatusCell
            status={ticket.status}
            onUpdate={(s) => handleStatusChange(ticket.id, s)}
          />
        </Table.Td>
      )}
      {vc.has("title") && (
        <Table.Td>
          <Text size="sm" className="text-text-primary" lineClamp={1}>{ticket.title}</Text>
        </Table.Td>
      )}
      {vc.has("priority") && (
        <Table.Td style={{ width: 40 }}>
          <Tooltip label={PRIORITY_LABELS[ticket.priority ?? 4] ?? "No priority"} position="top">
            <div className="flex items-center justify-center">
              <PriorityIcon priority={ticket.priority} size={16} />
            </div>
          </Tooltip>
        </Table.Td>
      )}
      {vc.has("dri") && (
        <Table.Td style={{ width: 120 }}>
          {ticket.assignee ? (
            <div className="flex items-center gap-1.5">
              <Avatar size="xs" radius="xl" src={ticket.assignee.image}>
                {(ticket.assignee.name ?? "?")[0]?.toUpperCase()}
              </Avatar>
              <Text size="xs" className="text-text-secondary" lineClamp={1}>{ticket.assignee.name}</Text>
            </div>
          ) : (
            <Text size="xs" className="text-text-muted">-</Text>
          )}
        </Table.Td>
      )}
      {vc.has("label") && (
        <Table.Td style={{ width: 100 }}>
          <Badge size="xs" variant="light" color={TYPE_COLORS[ticket.type] ?? "gray"}>
            {ticket.type.toLowerCase()}
          </Badge>
        </Table.Td>
      )}
      {vc.has("epic") && (
        <Table.Td style={{ width: 120 }}>
          {ticket.epic ? (
            <Text size="xs" className="text-text-secondary" lineClamp={1}>{ticket.epic.name}</Text>
          ) : (
            <Text size="xs" className="text-text-muted">-</Text>
          )}
        </Table.Td>
      )}
      {vc.has("cycle") && (
        <Table.Td style={{ width: 50 }}>
          {ticket.cycle ? (
            <Text size="xs" className="text-text-secondary">{ticket.cycle.name.replace(/\D+/g, "") || ticket.cycle.name}</Text>
          ) : (
            <Text size="xs" className="text-text-muted">-</Text>
          )}
        </Table.Td>
      )}
    </Table.Tr>
  );

  return (
    <Stack gap="sm">
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <SegmentedControl
          value={view}
          onChange={(v) => { setView(v); debouncedSave({ view: v }); }}
          size="xs"
          data={[
            { value: "table", label: (<Tooltip label="Table" position="bottom"><div className="flex items-center justify-center px-1"><IconLayoutList size={15} /></div></Tooltip>) },
            { value: "board", label: (<Tooltip label="Board" position="bottom"><div className="flex items-center justify-center px-1"><IconLayoutColumns size={15} /></div></Tooltip>) },
            { value: "list", label: (<Tooltip label="List" position="bottom"><div className="flex items-center justify-center px-1"><IconList size={15} /></div></Tooltip>) },
          ]}
          styles={{ root: { backgroundColor: "var(--color-surface-secondary)", border: "1px solid var(--color-border-primary)" } }}
        />

        <div className="flex-1" />

        <TextInput
          placeholder="Search..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          styles={{
            root: { width: 200 },
            input: { backgroundColor: "transparent", border: "1px solid var(--color-border-primary)", fontSize: "0.8rem", height: 30, minHeight: 30 },
          }}
        />

        <div className="flex items-center border border-border-primary rounded-md overflow-hidden">
          <Tooltip label="Filter" position="bottom">
            <ActionIcon variant="subtle" size="sm" className="text-text-muted hover:text-text-primary rounded-none" style={{ height: 30, width: 30 }}>
              <IconFilter size={15} />
            </ActionIcon>
          </Tooltip>
          <div className="w-px h-4 bg-border-primary" />
          <Popover position="bottom-end" withinPortal shadow="md">
            <Popover.Target>
              <Tooltip label="Display settings" position="bottom">
                <ActionIcon variant="subtle" size="sm" className="text-text-muted hover:text-text-primary rounded-none" style={{ height: 30, width: 30 }}>
                  <IconAdjustments size={15} />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown
              styles={{
                dropdown: {
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-primary)",
                  minWidth: 220,
                  maxWidth: 240,
                },
              }}
            >
              <div className="flex items-center justify-between gap-4 py-1">
                <Text size="xs" className="text-text-muted whitespace-nowrap">Group by</Text>
                <Select
                  value={groupBy}
                  onChange={(v) => { if (v) { setGroupBy(v as GroupByField); debouncedSave({ groupBy: v }); } }}
                  data={GROUP_BY_OPTIONS}
                  size="xs"
                  variant="filled"
                  comboboxProps={{ withinPortal: true }}
                  styles={{
                    root: { flex: 1 },
                    input: { fontSize: "0.8rem", height: 28, minHeight: 28 },
                  }}
                />
              </div>
              <div className="border-t border-border-primary mt-2 pt-2">
                <Text size="xs" className="text-text-muted mb-2.5">Visibility</Text>
                <div className="flex flex-wrap gap-1">
                  {COLUMN_OPTIONS.map((col) => {
                    const on = visibleColumns.has(col.key);
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => !col.locked && toggleColumn(col.key)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          col.locked
                            ? "bg-surface-hover text-text-muted cursor-default"
                            : on
                              ? "bg-surface-hover text-text-primary cursor-pointer"
                              : "bg-transparent text-text-muted/40 cursor-pointer hover:text-text-muted"
                        }`}
                      >
                        {col.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Popover.Dropdown>
          </Popover>
        </div>

        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => setModalOpened(true)}
          disabled={!product}
          variant="light"
          styles={{ root: { height: 30, paddingLeft: 10, paddingRight: 12, fontSize: "0.8rem" } }}
        >
          New ticket
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <Stack gap="xs">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={36} />)}
        </Stack>
      ) : (activeTickets.length > 0 || completedTickets.length > 0) ? (
        view === "board" ? (
          <TicketKanbanBoard
            tickets={sorted as Array<{ id: string; shortId: string | null; title: string; status: TicketStatus; priority: number | null; type: string; assignee: { id: string; name: string | null; image: string | null } | null; feature: { id: string; name: string } | null; epic: { id: string; name: string } | null }>}
            productId={product?.id ?? ""}
            basePath={basePath}
          />
        ) : view === "list" ? (
          <div className="border border-border-primary rounded-lg overflow-hidden">
            {groups.map((group) => (
              groupBy === "none" ? (
                <div key={group.key}>{group.items.map(renderListItem)}</div>
              ) : (
                <React.Fragment key={`group-${group.key}`}>
                  <div
                    className="bg-surface-secondary/50 px-3 pt-4 pb-2 border-b border-border-primary cursor-pointer select-none flex items-center gap-1.5"
                    onClick={() => toggleCollapsed(group.key)}
                  >
                    {collapsed.has(group.key) ? (
                      <IconChevronRight size={14} className="text-text-muted" />
                    ) : (
                      <IconChevronDown size={14} className="text-text-muted" />
                    )}
                    <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wide">
                      {group.label}
                    </Text>
                    <Badge size="xs" variant="light">{group.items.length}</Badge>
                  </div>
                  {!collapsed.has(group.key) && group.items.map(renderListItem)}
                </React.Fragment>
              )
            ))}
            {completedTickets.length > 0 && (
              <>
                <div
                  className="bg-surface-secondary/50 px-3 pt-4 pb-2 border-b border-border-primary cursor-pointer select-none flex items-center gap-1.5"
                  onClick={() => toggleCollapsed("__completed")}
                >
                  {collapsed.has("__completed") ? (
                    <IconChevronRight size={14} className="text-text-muted" />
                  ) : (
                    <IconChevronDown size={14} className="text-text-muted" />
                  )}
                  <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wide">Completed</Text>
                  <Badge size="xs" variant="light">{completedTickets.length}</Badge>
                </div>
                {!collapsed.has("__completed") && completedTickets.map(renderListItem)}
              </>
            )}
          </div>
        ) : (
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
                {vc.has("id") && <Table.Th style={{ width: 70 }}><span className="text-text-muted">ID</span></Table.Th>}
                {vc.has("status") && <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("title") && <SortHeader label="Title" field="title" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("priority") && <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("dri") && <SortHeader label="DRI" field="assignee" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("label") && <SortHeader label="Label" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("epic") && <SortHeader label="Epic" field="epic" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("cycle") && <SortHeader label="Cycle" field="cycle" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groups.map((group) => (
                groupBy === "none" ? (
                  group.items.map(renderRow)
                ) : (
                  <React.Fragment key={`group-${group.key}`}>
                    <Table.Tr
                      className="cursor-pointer select-none"
                      onClick={() => toggleCollapsed(group.key)}
                    >
                      <Table.Td
                        colSpan={colCount}
                        className="bg-surface-secondary/50"
                        style={{ paddingTop: 16, paddingBottom: 8 }}
                      >
                        <div className="flex items-center gap-1.5">
                          {collapsed.has(group.key) ? (
                            <IconChevronRight size={14} className="text-text-muted" />
                          ) : (
                            <IconChevronDown size={14} className="text-text-muted" />
                          )}
                          <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wide">
                            {group.label}
                          </Text>
                          <Badge size="xs" variant="light">{group.items.length}</Badge>
                        </div>
                      </Table.Td>
                    </Table.Tr>
                    {!collapsed.has(group.key) && group.items.map(renderRow)}
                  </React.Fragment>
                )
              ))}

              {/* Completed section */}
              {completedTickets.length > 0 && (
                <>
                  <Table.Tr
                    className="cursor-pointer select-none"
                    onClick={() => toggleCollapsed("__completed")}
                  >
                    <Table.Td
                      colSpan={colCount}
                      className="bg-surface-secondary/50"
                      style={{ paddingTop: 16, paddingBottom: 8 }}
                    >
                      <div className="flex items-center gap-1.5">
                        {collapsed.has("__completed") ? (
                          <IconChevronRight size={14} className="text-text-muted" />
                        ) : (
                          <IconChevronDown size={14} className="text-text-muted" />
                        )}
                        <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wide">
                          Completed
                        </Text>
                        <Badge size="xs" variant="light">{completedTickets.length}</Badge>
                      </div>
                    </Table.Td>
                  </Table.Tr>
                  {!collapsed.has("__completed") && completedTickets.map(renderRow)}
                </>
              )}
            </Table.Tbody>
          </Table>
        </div>
        )
      ) : tickets && tickets.length > 0 ? (
        <Text size="sm" className="text-text-muted py-8 text-center">
          No tickets match your search.
        </Text>
      ) : (
        <EmptyState
          icon={IconTicket}
          title="No tickets yet"
          message="Create your first ticket to start tracking work."
          action={
            <Button onClick={() => setModalOpened(true)} leftSection={<IconPlus size={16} />} color="brand" disabled={!product}>
              New ticket
            </Button>
          }
        />
      )}

      {product && (
        <CreateTicketModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          productId={product.id}
          productName={product.name}
          basePath={basePath}
          features={features}
          cycles={cycles}
          epics={epics}
        />
      )}
    </Stack>
  );
}
