"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Popover,
  Select,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAdjustments,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFilter,
  IconLayoutKanban,
  IconList,
  IconPencil,
  IconPlus,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
  IconStack2,
  IconTable,
  IconTicket,
  IconTimeline,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import {
  useMultiSelect,
  SelectSlot,
  BulkActionBar,
  BulkActionMenu,
  buildUndoGroups,
} from "~/app/_components/shared/multiSelect";
import { PeekDrawer } from "~/app/_components/product/peek/PeekDrawer";
import { TicketPeek } from "~/app/_components/product/peek/TicketPeek";
import { CreateTicketModal } from "~/app/_components/product/CreateTicketModal";
import { EditTicketModal } from "~/app/_components/product/EditTicketModal";
import { generateLinearId } from "~/lib/fun-ids";
import { TicketKanbanBoard } from "~/app/_components/product/TicketKanbanBoard";
import { useCoalescedSave } from "./useCoalescedSave";
import { PriorityIcon, PRIORITY_LABELS as PRIORITY_LABEL_MAP } from "~/app/_components/product/PriorityIcon";
import { NotionSyncBadge } from "~/app/_components/product/NotionSyncBadge";
import { BlockedIndicator } from "~/app/_components/product/TicketDependenciesSection";
import { EpicsList } from "~/app/_components/product/EpicsList";
import { CreateEpicModal } from "~/app/_components/CreateEpicModal";
import { TagBadge } from "~/app/_components/TagBadge";
import {
  ListPageTopBar,
  ListPageViewTabs,
  ListPageSearch,
  ListPageButton,
  ListPagePrimaryButton,
  ListPageFilterPills,
  PillSelect,
} from "~/app/_components/listPage";
import type { ListPageFilterPill } from "~/app/_components/listPage";
import table from "~/app/_components/listPage/DataTable.module.css";
import { usePageSearchHotkey } from "~/hooks/usePageSearchHotkey";
import { getAvatarColor, getInitial } from "~/utils/avatarColors";
import {
  groupTickets,
  GROUP_BY_OPTIONS,
  type GroupByField,
} from "./ticketGrouping";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_ORDER,
  STATUS_OPTIONS,
  TICKET_STATUSES,
  COMPLETED_STATUSES,
  type TicketStatus,
} from "~/lib/ticket-statuses";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_LABELS = PRIORITY_LABEL_MAP;

const TYPE_COLORS: Record<string, string> = {
  BUG: "red", FEATURE: "blue", CHORE: "gray", IMPROVEMENT: "teal", SPIKE: "violet", RESEARCH: "yellow",
};

type TicketType = "BUG" | "FEATURE" | "CHORE" | "IMPROVEMENT" | "SPIKE" | "RESEARCH";

const TYPE_OPTIONS: Array<{ value: TicketType; label: string }> = [
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "CHORE", label: "Chore" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "SPIKE", label: "Spike" },
  { value: "RESEARCH", label: "Research" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

// The in-place priority pill. 4 ("No priority") and null read the same, so both
// map to "none"; picking "none" clears the field.
const PRIORITY_NONE = "none";

const PRIORITY_OPTIONS = [
  { value: "0", label: PRIORITY_LABEL_MAP[0] ?? "Urgent" },
  { value: "1", label: PRIORITY_LABEL_MAP[1] ?? "High" },
  { value: "2", label: PRIORITY_LABEL_MAP[2] ?? "Medium" },
  { value: "3", label: PRIORITY_LABEL_MAP[3] ?? "Low" },
  { value: PRIORITY_NONE, label: "None" },
];

const PRIORITY_COLORS: Record<string, string> = {
  "0": "red", "1": "orange", "2": "yellow", "3": "blue", [PRIORITY_NONE]: "gray",
};

function priorityValue(priority: number | null | undefined): string {
  return priority == null || priority === 4 ? PRIORITY_NONE : String(priority);
}

// Colours of the toolbar pills naming each applied filter.
const FACET_PILL_COLORS: Record<Exclude<FilterKey, "status" | "type">, string> = {
  priority: "grape", assignee: "brand", epic: "indigo", cycle: "cyan", labels: "teal",
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type FilterKey = "status" | "priority" | "type" | "assignee" | "epic" | "cycle" | "labels";

interface TicketFilters {
  status: string[];
  priority: string[];
  type: string[];
  assignee: string[];
  epic: string[];
  cycle: string[];
  labels: string[];
}

// Arrays are never mutated in place (all updates spread), so a shared empty
// reference is safe to use as the default / cleared state.
/** The per-user, per-product view prefs the page persists (saveViewPrefs input). */
interface SavedViewPrefs {
  view: string;
  groupBy: string;
  sortField: string;
  sortDir: string;
  visibleColumns: string[];
  entity: "tickets" | "epics";
  filters: TicketFilters;
}

const EMPTY_FILTERS: TicketFilters = {
  status: [], priority: [], type: [], assignee: [], epic: [], cycle: [], labels: [],
};

const FILTER_FACET_META: Array<{ key: FilterKey; label: string }> = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "type", label: "Type" },
  { key: "assignee", label: "DRI" },
  { key: "epic", label: "Epic" },
  { key: "cycle", label: "Cycle" },
  { key: "labels", label: "Labels" },
];

type FacetOptions = Record<FilterKey, Array<{ value: string; label: string }>>;


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
// SortHeader
// ---------------------------------------------------------------------------

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
// Filter popover
// ---------------------------------------------------------------------------

function FilterPopover({ facetOptions, filters, activeCount, onToggle, onClear }: {
  facetOptions: FacetOptions;
  filters: TicketFilters;
  activeCount: number;
  onToggle: (key: FilterKey, value: string) => void;
  onClear: () => void;
}) {
  return (
    <Popover position="bottom-end" withinPortal shadow="md">
      <Popover.Target>
        <ListPageButton active={activeCount > 0} count={activeCount} aria-label="Filter tickets">
          <IconFilter size={13} stroke={1.75} />
          Filter
        </ListPageButton>
      </Popover.Target>
      <Popover.Dropdown
        styles={{
          dropdown: {
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            minWidth: 240,
            maxWidth: 280,
            maxHeight: 440,
            overflowY: "auto",
          },
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <Text size="xs" fw={600} className="text-text-primary">Filter</Text>
          {activeCount > 0 && (
            <UnstyledButton onClick={onClear} className="text-[10px] text-text-muted hover:text-text-primary">
              Clear all
            </UnstyledButton>
          )}
        </div>
        <Stack gap="sm">
          {FILTER_FACET_META.map((facet) => {
            const opts = facetOptions[facet.key];
            if (opts.length === 0) return null;
            const sel = filters[facet.key];
            return (
              <div key={facet.key}>
                <Text size="xs" className="text-text-muted mb-1.5">{facet.label}</Text>
                <div className="flex flex-wrap gap-1">
                  {opts.map((o) => {
                    const on = sel.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => onToggle(facet.key, o.value)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          on
                            ? "bg-brand-primary text-white"
                            : "bg-surface-hover text-text-muted hover:text-text-primary"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TicketsBacklogPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  // URL-driven filters - deep links from the Overview tab
  // (?status=BLOCKED, ?assignee=me). Applied server-side via ticket.list.
  const statusParam = searchParams.get("status");
  const urlStatus =
    statusParam && statusParam in STATUS_LABELS
      ? (statusParam as TicketStatus)
      : undefined;
  const filterAssigneeMe = searchParams.get("assignee") === "me";
  const sessionUserId = session?.user?.id;
  // With ?assignee=me the ticket query stays disabled until the session
  // resolves; treat that gap as loading so we don't flash an empty state.
  const sessionPending = filterAssigneeMe && !sessionUserId;
  const [modalOpened, setModalOpened] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  usePageSearchHotkey(searchRef);
  const [editTicketId, setEditTicketId] = useState<string | null>(null);
  const [epicModalOpened, setEpicModalOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState("table");
  const [entity, setEntity] = useState<"tickets" | "epics">("tickets");
  const [groupBy, setGroupBy] = useState<GroupByField>("none");
  const [filters, setFilters] = useState<TicketFilters>(EMPTY_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(["id", "status", "title", "priority", "dri", "type", "labels", "epic", "cycle"]),
  );
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // ── Load & save view preferences ──
  const { data: savedPrefs } = api.product.product.getViewPrefs.useQuery(
    { productSlug, workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const savePrefs = api.product.product.saveViewPrefs.useMutation();
  const saveMutateRef = useRef(savePrefs.mutate);
  saveMutateRef.current = savePrefs.mutate;

  // Every control saves only the key it owns; the hook merges saves that land
  // inside one debounce window so none of them is dropped (see its doc).
  const { push: debouncedSave } = useCoalescedSave<SavedViewPrefs>(
    useCallback((prefs: Partial<SavedViewPrefs>) => {
      if (!workspaceId) return;
      saveMutateRef.current({ productSlug, workspaceId, prefs });
    }, [workspaceId, productSlug]),
  );

  // Restore prefs on load
  useEffect(() => {
    if (savedPrefs && !prefsLoaded) {
      if (savedPrefs.view) setView(savedPrefs.view as string);
      if (savedPrefs.groupBy) setGroupBy(savedPrefs.groupBy as GroupByField);
      if (savedPrefs.sortField) setSortField(savedPrefs.sortField as SortField);
      if (savedPrefs.sortDir) setSortDir(savedPrefs.sortDir as SortDir);
      if (savedPrefs.visibleColumns) setVisibleColumns(new Set(savedPrefs.visibleColumns as string[]));
      if (savedPrefs.entity === "epics" || savedPrefs.entity === "tickets") {
        setEntity(savedPrefs.entity);
      }
      if (savedPrefs.filters && typeof savedPrefs.filters === "object") {
        // Saved prefs are untrusted JSON - guard each facet is actually an
        // array. Stale values (e.g. a deleted epic id) are harmless: they
        // simply match no tickets and aren't offered in facetOptions.
        const f = savedPrefs.filters as Partial<TicketFilters>;
        const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
        setFilters({
          status: arr(f.status),
          priority: arr(f.priority),
          type: arr(f.type),
          assignee: arr(f.assignee),
          epic: arr(f.epic),
          cycle: arr(f.cycle),
          labels: arr(f.labels),
        });
      }
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
    { key: "type", label: "Type" },
    { key: "labels", label: "Labels" },
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

  // Kept as one memoised object because the bulk-update optimistic patch
  // must read/write the cache under the exact same query input.
  const listInput = useMemo(
    () => ({
      productId: product?.id ?? "",
      ...(urlStatus ? { status: urlStatus } : {}),
      ...(filterAssigneeMe && sessionUserId
        ? { assigneeId: sessionUserId }
        : {}),
    }),
    [product?.id, urlStatus, filterAssigneeMe, sessionUserId],
  );

  const { data: tickets, isLoading } = api.product.ticket.list.useQuery(
    listInput,
    // When ?assignee=me is present, wait for the session so the first fetch
    // is already filtered instead of flashing the full backlog.
    { enabled: !!product?.id && (!filterAssigneeMe || !!sessionUserId) },
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "", productId: product?.id },
    { enabled: !!workspaceId && !!product?.id },
  );

  // Epics are per-product. `includeUnassigned` keeps pre-backfill epics (no
  // product yet) visible here so they can be opened and given one.
  const { data: epics } = api.epic.list.useQuery(
    { workspaceId: workspaceId ?? "", productId: product?.id },
    { enabled: !!workspaceId && !!product?.id },
  );

  const utils = api.useUtils();

  // In-place Status / Priority / Type edits from the table's pill selects.
  // Optimistic so the pill shows the new value at once; rolled back on error.
  const updateTicket = api.product.ticket.update.useMutation({
    onMutate: async (vars) => {
      await utils.product.ticket.list.cancel(listInput);
      const prev = utils.product.ticket.list.getData(listInput);
      if (prev) {
        utils.product.ticket.list.setData(
          listInput,
          prev.map((t) => {
            if (t.id !== vars.id) return t;
            const next = { ...t };
            if (vars.status !== undefined) next.status = vars.status;
            if (vars.type !== undefined) next.type = vars.type;
            if (vars.priority !== undefined) next.priority = vars.priority;
            return next;
          }),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, mctx) => {
      if (mctx?.prev) utils.product.ticket.list.setData(listInput, mctx.prev);
      notifications.show({
        title: "Update failed",
        message: "Your change was not saved. Please try again.",
        color: "red",
      });
    },
    onSettled: async () => {
      if (product?.id) {
        await utils.product.ticket.list.invalidate({ productId: product.id });
      }
    },
  });

  // ── Multi-select ──
  const sel = useMultiSelect();
  const selClear = sel.clear;
  // Selection survives view/groupBy switches but is cleared whenever the
  // underlying item set changes meaning (filters, search, entity, deep links).
  useEffect(() => {
    selClear();
  }, [selClear, entity, search, filters, urlStatus, filterAssigneeMe, productSlug]);

  type BulkPatch = {
    status?: TicketStatus;
    type?: "BUG" | "FEATURE" | "CHORE" | "IMPROVEMENT" | "SPIKE" | "RESEARCH";
    priority?: number | null;
    assigneeId?: string | null;
    epicId?: string | null;
    cycleId?: string | null;
  };

  const members = useMemo(
    () =>
      (workspace?.members ?? []).map(
        (m: { user: { id: string; name: string | null } }) => ({
          id: m.user.id,
          name: m.user.name,
        }),
      ),
    [workspace?.members],
  );

  const bulkUpdate = api.product.ticket.bulkUpdate.useMutation({
    // Optimistic: patch the cached list immediately, roll back on error.
    onMutate: async (vars) => {
      await utils.product.ticket.list.cancel(listInput);
      const prev = utils.product.ticket.list.getData(listInput);
      if (prev) {
        const idSet = new Set(vars.ids);
        utils.product.ticket.list.setData(
          listInput,
          prev.map((t) => {
            if (!idSet.has(t.id)) return t;
            const next = { ...t };
            if (vars.status !== undefined) next.status = vars.status;
            if (vars.type !== undefined) next.type = vars.type;
            if (vars.priority !== undefined) next.priority = vars.priority;
            if (vars.assigneeId !== undefined) {
              const m = members.find((x) => x.id === vars.assigneeId);
              next.assignee =
                vars.assigneeId && m
                  ? { id: m.id, name: m.name, image: null }
                  : null;
            }
            if (vars.epicId !== undefined) {
              const e = (epics ?? []).find((x) => x.id === vars.epicId);
              next.epic = vars.epicId && e ? { id: e.id, name: e.name } : null;
            }
            if (vars.cycleId !== undefined) {
              const c = (cycles ?? []).find((x) => x.id === vars.cycleId);
              next.cycle =
                vars.cycleId && c
                  ? {
                      id: c.id,
                      name: c.name,
                      status: c.status,
                      startDate: c.startDate,
                      endDate: c.endDate,
                    }
                  : null;
            }
            return next;
          }),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, mctx) => {
      if (mctx?.prev) utils.product.ticket.list.setData(listInput, mctx.prev);
      notifications.show({
        title: "Bulk update failed",
        message: "Your changes were not saved. Please try again.",
        color: "red",
      });
    },
    onSettled: async () => {
      if (product?.id) {
        await utils.product.ticket.list.invalidate({ productId: product.id });
      }
    },
  });

  // Bulk hard delete - confirmed via modal (no undo for deletes).
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const bulkDelete = api.product.ticket.bulkDelete.useMutation({
    onSuccess: async (res) => {
      setConfirmDeleteOpen(false);
      sel.clear();
      notifications.show({
        message: `Deleted ${res.count} ticket${res.count === 1 ? "" : "s"}`,
      });
      if (product?.id) {
        await utils.product.ticket.list.invalidate({ productId: product.id });
      }
    },
    onError: () => {
      notifications.show({
        title: "Delete failed",
        message: "The tickets were not deleted. Please try again.",
        color: "red",
      });
    },
  });

  // Apply a uniform patch to every selected ticket, with an Undo toast that
  // restores the previous values (one bulk call per distinct prior state).
  const applyBulk = (patch: BulkPatch) => {
    const ids = Array.from(sel.selected);
    if (ids.length === 0) return;
    const affected = (tickets ?? []).filter((t) => sel.selected.has(t.id));
    const undoGroups = buildUndoGroups(affected, (t) => {
      const prev: Record<string, unknown> = {};
      if (patch.status !== undefined) prev.status = t.status;
      if (patch.type !== undefined) prev.type = t.type;
      if (patch.priority !== undefined) prev.priority = t.priority ?? null;
      if (patch.assigneeId !== undefined)
        prev.assigneeId = t.assignee?.id ?? null;
      if (patch.epicId !== undefined) prev.epicId = t.epic?.id ?? null;
      if (patch.cycleId !== undefined) prev.cycleId = t.cycle?.id ?? null;
      return prev;
    });
    bulkUpdate.mutate(
      { ids, ...patch },
      {
        onSuccess: (res) => {
          const noteId = notifications.show({
            message: (
              <Group gap="sm" wrap="nowrap" justify="space-between">
                <Text size="sm">
                  Updated {res.count} ticket{res.count === 1 ? "" : "s"}
                </Text>
                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() => {
                    notifications.hide(noteId);
                    for (const g of undoGroups) {
                      bulkUpdate.mutate({ ids: g.ids, ...(g.patch as BulkPatch) });
                    }
                  }}
                >
                  Undo
                </Button>
              </Group>
            ),
            autoClose: 8000,
          });
        },
      },
    );
  };

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

  const handlePriorityChange = (ticketId: string, value: string) => {
    updateTicket.mutate({ id: ticketId, priority: value === PRIORITY_NONE ? null : Number(value) });
  };

  const handleTypeChange = (ticketId: string, type: TicketType) => {
    updateTicket.mutate({ id: ticketId, type });
  };

  // ── Filters ──
  // Facet options are derived from the loaded tickets, so only values actually
  // present in the product are offered. "none" is a synthetic value for the
  // unset bucket (no priority / unassigned / no epic / no cycle).
  const facetOptions = useMemo<FacetOptions>(() => {
    const status = new Map<string, string>();
    const priority = new Map<string, string>();
    const type = new Map<string, string>();
    const assignee = new Map<string, string>();
    const epic = new Map<string, string>();
    const cycle = new Map<string, string>();
    const labels = new Map<string, string>();

    for (const t of tickets ?? []) {
      status.set(t.status, STATUS_LABELS[t.status] ?? t.status);
      const pKey = t.priority == null ? "none" : String(t.priority);
      priority.set(pKey, t.priority == null ? "No priority" : (PRIORITY_LABELS[t.priority] ?? pKey));
      type.set(t.type, t.type.toLowerCase());
      assignee.set(t.assignee?.id ?? "none", t.assignee?.name ?? "Unassigned");
      epic.set(t.epic?.id ?? "none", t.epic?.name ?? "No epic");
      cycle.set(t.cycle?.id ?? "none", t.cycle?.name ?? "No cycle");
      for (const x of t.tags ?? []) labels.set(x.tag.id, x.tag.name);
    }

    const toOpts = (m: Map<string, string>) =>
      Array.from(m, ([value, label]) => ({ value, label }));
    // "none" always sorts last; other values alphabetical by label.
    const alpha = (m: Map<string, string>) =>
      toOpts(m).sort((a, b) =>
        a.value === "none" ? 1 : b.value === "none" ? -1 : a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
      );

    return {
      status: toOpts(status).sort((a, b) => (STATUS_ORDER[a.value] ?? 99) - (STATUS_ORDER[b.value] ?? 99)),
      priority: toOpts(priority).sort(
        (a, b) => (a.value === "none" ? 99 : Number(a.value)) - (b.value === "none" ? 99 : Number(b.value)),
      ),
      type: alpha(type),
      assignee: alpha(assignee),
      epic: alpha(epic),
      cycle: alpha(cycle),
      labels: alpha(labels),
    };
  }, [tickets]);

  const activeFilterCount = FILTER_FACET_META.reduce((n, f) => n + filters[f.key].length, 0);

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters((prev) => {
      const cur = prev[key];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const updated = { ...prev, [key]: next };
      debouncedSave({ filters: updated });
      return updated;
    });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    debouncedSave({ filters: EMPTY_FILTERS });
  };

  // Filter + sort
  const sorted = useMemo(() => {
    if (!tickets) return [];
    const q = search.toLowerCase().trim();
    const matchesFilters = (t: (typeof tickets)[number]) => {
      if (filters.status.length && !filters.status.includes(t.status)) return false;
      if (filters.priority.length && !filters.priority.includes(t.priority == null ? "none" : String(t.priority))) return false;
      if (filters.type.length && !filters.type.includes(t.type)) return false;
      if (filters.assignee.length && !filters.assignee.includes(t.assignee?.id ?? "none")) return false;
      if (filters.epic.length && !filters.epic.includes(t.epic?.id ?? "none")) return false;
      if (filters.cycle.length && !filters.cycle.includes(t.cycle?.id ?? "none")) return false;
      if (filters.labels.length && !(t.tags ?? []).some((x) => filters.labels.includes(x.tag.id))) return false;
      return true;
    };
    const matchesSearch = (t: (typeof tickets)[number]) =>
      !q ||
      t.title.toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q) ||
      (t.assignee?.name ?? "").toLowerCase().includes(q);

    const list = tickets.filter((t) => matchesFilters(t) && matchesSearch(t));
    list.sort((a, b) =>
      cmp(
        sortValue(a as unknown as Record<string, unknown>, sortField),
        sortValue(b as unknown as Record<string, unknown>, sortField),
        sortDir,
      ),
    );
    return list;
  }, [tickets, search, sortField, sortDir, filters]);

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

  // Group active tickets (pure grouping core lives in ./ticketGrouping)
  const groups = useMemo(
    () => groupTickets(activeTickets, groupBy),
    [activeTickets, groupBy],
  );

  // Visible row order for shift-click range selection.
  const visibleIds = useMemo(() => {
    if (view === "board") return sorted.map((t) => t.id);
    const ids: string[] = [];
    for (const g of groups) {
      if (groupBy === "none" || !collapsed.has(g.key)) {
        ids.push(...g.items.map((t) => t.id));
      }
    }
    if (!collapsed.has("__completed")) {
      ids.push(...completedTickets.map((t) => t.id));
    }
    return ids;
  }, [view, sorted, groups, groupBy, collapsed, completedTickets]);

  // ── Peek drawer (?peek=<id>) - detail-over-list, the list never unmounts ──
  const peekBasePath = `/w/${workspace?.slug ?? ""}/products/${productSlug}/tickets`;
  const peekId = searchParams.get("peek");
  const setPeek = (id: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("peek", id);
    else next.delete("peek");
    const qs = next.toString();
    router.push(qs ? `${peekBasePath}?${qs}` : peekBasePath, { scroll: false });
  };
  const peekIndex = peekId ? visibleIds.indexOf(peekId) : -1;
  const peekPrev = peekIndex > 0 ? () => setPeek(visibleIds[peekIndex - 1]!) : undefined;
  const peekNext =
    peekIndex !== -1 && peekIndex < visibleIds.length - 1
      ? () => setPeek(visibleIds[peekIndex + 1]!)
      : undefined;

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/tickets`;
  const epicsBasePath = `/w/${workspace.slug}/products/${productSlug}/epics`;

  // Drop overview deep-link params (?status=, ?assignee=me); keep the rest.
  const removeUrlFilters = (keys: Array<"status" | "assignee">) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const k of keys) next.delete(k);
    const qs = next.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath);
  };

  const clearAllFilters = () => {
    clearFilters();
    if (urlStatus ?? filterAssigneeMe) removeUrlFilters(["status", "assignee"]);
  };

  // One toolbar pill per applied filter: the deep-link params first, then each
  // facet value picked in the Filter popover.
  const facetPillLabel = (key: FilterKey, value: string): string => {
    const label = facetOptions[key].find((o) => o.value === value)?.label ?? value;
    if (value === "none") return label; // "No priority", "Unassigned", "No epic"...
    switch (key) {
      case "priority": return `${label} priority`;
      case "type": return TYPE_LABELS[value] ?? label;
      case "assignee": return `DRI: ${label}`;
      case "epic": return `Epic: ${label}`;
      default: return label;
    }
  };
  const facetPillColor = (key: FilterKey, value: string): string => {
    if (key === "status") return STATUS_COLORS[value] ?? "gray";
    if (key === "type") return TYPE_COLORS[value] ?? "gray";
    return FACET_PILL_COLORS[key];
  };
  const filterPills: ListPageFilterPill[] = [
    ...(urlStatus
      ? [{
          key: "url-status",
          label: STATUS_LABELS[urlStatus] ?? urlStatus,
          color: STATUS_COLORS[urlStatus] ?? "gray",
          onRemove: () => removeUrlFilters(["status"]),
        }]
      : []),
    ...(filterAssigneeMe
      ? [{
          key: "url-assignee",
          label: "My tickets",
          color: "brand",
          onRemove: () => removeUrlFilters(["assignee"]),
        }]
      : []),
    ...FILTER_FACET_META.flatMap((facet) =>
      filters[facet.key].map((value) => ({
        key: `${facet.key}-${value}`,
        label: facetPillLabel(facet.key, value),
        color: facetPillColor(facet.key, value),
        onRemove: () => toggleFilter(facet.key, value),
      })),
    ),
  ];

  // Row-level selection handlers shared by the list and table renderers:
  // cmd/ctrl-click toggles, shift-click range-selects, plain click peeks.
  const rowClickHandlers = (ticketId: string, navigate: () => void) => ({
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        sel.toggle(ticketId);
        return;
      }
      if (e.shiftKey) {
        sel.selectRange(ticketId, visibleIds);
        return;
      }
      navigate();
    },
    onMouseDown: (e: React.MouseEvent) => {
      // Keep shift-click from starting a text selection.
      if (e.shiftKey) e.preventDefault();
    },
  });

  // Group-header chevron slot: swaps to a select-all-of-group checkbox on
  // hover (indeterminate when partially selected). Zero layout shift.
  const renderGroupChevron = (ids: string[], collapsedKey: string) => {
    const selectedCount = ids.filter((id) => sel.selected.has(id)).length;
    const all = ids.length > 0 && selectedCount === ids.length;
    const some = selectedCount > 0 && !all;
    return (
      <SelectSlot
        selected={all}
        indeterminate={some}
        onToggle={() => sel.setMany(ids, !all)}
      >
        {collapsed.has(collapsedKey) ? (
          <IconChevronRight size={14} className="text-text-muted" />
        ) : (
          <IconChevronDown size={14} className="text-text-muted" />
        )}
      </SelectSlot>
    );
  };

  // List item renderer (compact, no table)
  const renderListItem = (ticket: (typeof sorted)[number]) => (
    <div
      key={ticket.id}
      className={`group/row flex items-center gap-3 px-8 py-2 transition-colors cursor-pointer border-b border-border-primary ${sel.isSelected(ticket.id) ? "bg-surface-hover" : "hover:bg-surface-hover"}`}
      {...rowClickHandlers(ticket.id, () => setPeek(ticket.id))}
    >
      <SelectSlot
        className="w-14 shrink-0"
        selected={sel.isSelected(ticket.id)}
        onToggle={() => sel.toggle(ticket.id)}
        onRangeToggle={() => sel.selectRange(ticket.id, visibleIds)}
      >
        <Text size="xs" className="text-text-muted font-mono" lineClamp={1}>
          {product?.funTicketIds && ticket.shortId ? ticket.shortId : (ticket.number > 0 && product ? generateLinearId(product.name, ticket.number) : null)}
        </Text>
      </SelectSlot>
      <Badge size="xs" variant="filled" color={STATUS_COLORS[ticket.status] ?? "gray"} className="shrink-0" styles={{ label: { color: "var(--mantine-color-dark-9)" } }}>
        {STATUS_LABELS[ticket.status] ?? ticket.status}
      </Badge>
      <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
        {ticket.title}
      </Text>
      <BlockedIndicator
        openBlockerCount={ticket.openBlockerCount}
        isBlocked={ticket.isBlocked}
      />
      <NotionSyncBadge syncs={ticket.syncs} size={14} />
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
      {ticket.tags && ticket.tags.length > 0 && (
        <div className="flex gap-1 shrink-0">
          {ticket.tags.slice(0, 1).map((t: { tag: { id: string; name: string; color: string } }) => (
            <TagBadge key={t.tag.id} tag={t.tag} size="xs" />
          ))}
          {ticket.tags.length > 1 && (
            <Text size="xs" className="text-text-muted">+{ticket.tags.length - 1}</Text>
          )}
        </div>
      )}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            size="sm"
            className="shrink-0 text-text-muted hover:text-text-primary"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            aria-label="Ticket actions"
          >
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconPencil size={14} />}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setEditTicketId(ticket.id);
            }}
          >
            Edit
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );

  const vc = visibleColumns;
  // Columns the table renders. Labels / Epic / Cycle stay in the Display
  // popover's Visibility list but render on the title's sub-line, not as
  // their own columns. With ID hidden there is no checkbox column; selection
  // still works via cmd/ctrl- and shift-click.
  const colCount =
    1 + (["id", "status", "priority", "type", "dri"] as const).filter((c) => vc.has(c)).length;

  const ticketDisplayId = (ticket: (typeof sorted)[number]) =>
    product?.funTicketIds && ticket.shortId
      ? ticket.shortId
      : ticket.number > 0 && product
        ? generateLinearId(product.name, ticket.number)
        : null;

  // Pill selects sit inside a clickable row: stop their clicks (including the
  // portalled dropdown's, which bubble through React) from opening the peek.
  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();

  // Shared row renderer
  const renderRow = (ticket: (typeof sorted)[number]) => {
    const tags = vc.has("labels") ? (ticket.tags ?? []) : [];
    const metaText = [
      vc.has("epic") ? ticket.epic?.name : null,
      vc.has("cycle") ? ticket.cycle?.name : null,
    ].filter(Boolean);
    const hasMeta = metaText.length > 0 || tags.length > 0;
    return (
      <tr
        key={ticket.id}
        className={`${table.tableRow} group/row`}
        data-clickable="true"
        data-selected={sel.isSelected(ticket.id) ? "true" : "false"}
        {...rowClickHandlers(ticket.id, () => setPeek(ticket.id))}
      >
        {vc.has("id") && (
          <td style={{ width: 104 }}>
            <SelectSlot
              selected={sel.isSelected(ticket.id)}
              onToggle={() => sel.toggle(ticket.id)}
              onRangeToggle={() => sel.selectRange(ticket.id, visibleIds)}
            >
              <span className={`${table.muted} font-mono`}>{ticketDisplayId(ticket)}</span>
            </SelectSlot>
          </td>
        )}
        <td style={{ width: "100%", maxWidth: 0 }}>
          <div className="flex min-w-0 items-center gap-2">
            <span className={`${table.nameText} min-w-0`}>{ticket.title}</span>
            <BlockedIndicator
              openBlockerCount={ticket.openBlockerCount}
              isBlocked={ticket.isBlocked}
            />
          </div>
          {hasMeta && (
            <div className={table.nameMeta}>
              {metaText.length > 0 && <span>{metaText.join(" · ")}</span>}
              {tags.slice(0, 3).map((t: { tag: { id: string; name: string; color: string } }) => (
                <TagBadge key={t.tag.id} tag={t.tag} size="xs" />
              ))}
              {tags.length > 3 && <span>+{tags.length - 3}</span>}
            </div>
          )}
        </td>
        {vc.has("status") && (
          <td style={{ width: 170 }}>
            <div onClick={stopRowClick} style={{ width: 150 }}>
              <PillSelect
                value={ticket.status}
                data={STATUS_OPTIONS}
                color={STATUS_COLORS[ticket.status] ?? "gray"}
                aria-label="Status"
                onChange={(v) => handleStatusChange(ticket.id, v as TicketStatus)}
              />
            </div>
          </td>
        )}
        {vc.has("priority") && (
          <td style={{ width: 130 }}>
            <div onClick={stopRowClick} style={{ width: 110 }}>
              <PillSelect
                value={priorityValue(ticket.priority)}
                data={PRIORITY_OPTIONS}
                color={PRIORITY_COLORS[priorityValue(ticket.priority)] ?? "gray"}
                muted={priorityValue(ticket.priority) === PRIORITY_NONE}
                aria-label="Priority"
                onChange={(v) => handlePriorityChange(ticket.id, v)}
              />
            </div>
          </td>
        )}
        {vc.has("type") && (
          <td style={{ width: 150 }}>
            <div onClick={stopRowClick} style={{ width: 130 }}>
              <PillSelect
                value={ticket.type}
                data={TYPE_OPTIONS}
                color={TYPE_COLORS[ticket.type] ?? "gray"}
                aria-label="Type"
                onChange={(v) => handleTypeChange(ticket.id, v as TicketType)}
              />
            </div>
          </td>
        )}
        {vc.has("dri") && (
          <td style={{ width: 72 }}>
            {ticket.assignee ? (
              <Tooltip label={ticket.assignee.name ?? "Unknown"} withArrow>
                <Avatar
                  src={ticket.assignee.image}
                  size={26}
                  radius="xl"
                  color={getAvatarColor(ticket.assignee.id)}
                >
                  {getInitial(ticket.assignee.name)}
                </Avatar>
              </Tooltip>
            ) : (
              <span className={table.muted}>—</span>
            )}
          </td>
        )}
      </tr>
    );
  };

  // Group-header row (Group by buckets and the Completed section).
  const renderGroupRow = (key: string, label: string, ids: string[]) => (
    <tr key={`group-${key}`} className={`${table.groupRow} group/row`} onClick={() => toggleCollapsed(key)}>
      <td colSpan={colCount}>
        <div className={table.groupLabel}>
          {renderGroupChevron(ids, key)}
          {label}
          <Badge size="xs" variant="light">{ids.length}</Badge>
        </div>
      </td>
    </tr>
  );

  const entityTabs = [
    { value: "tickets" as const, label: "Tickets", icon: IconTicket },
    { value: "epics" as const, label: "Epics", icon: IconStack2 },
  ];
  const viewTabs =
    entity === "epics"
      ? [
          { value: "table", label: "Table", icon: IconTable },
          { value: "timeline", label: "Timeline", icon: IconTimeline },
          { value: "list", label: "List", icon: IconList },
        ]
      : [
          { value: "table", label: "Table", icon: IconTable },
          { value: "board", label: "Board", icon: IconLayoutKanban },
          { value: "list", label: "List", icon: IconList },
        ];

  return (
    <div className="flex flex-col">
      <ListPageTopBar
        left={
          <>
            <ListPageViewTabs
              aria-label="Tickets or epics"
              tabs={entityTabs}
              active={entity}
              onTabClick={(v) => { setEntity(v); debouncedSave({ entity: v }); }}
            />
            <ListPageViewTabs
              aria-label="View"
              tabs={viewTabs}
              active={view}
              onTabClick={(v) => { setView(v); debouncedSave({ view: v }); }}
            />
            {entity === "tickets" && (
              <ListPageFilterPills pills={filterPills} onClearAll={clearAllFilters} />
            )}
          </>
        }
        actions={
          <>
            <ListPageSearch ref={searchRef} value={search} onChange={setSearch} />

            {entity === "tickets" && (
              <FilterPopover
                facetOptions={facetOptions}
                filters={filters}
                activeCount={activeFilterCount}
                onToggle={toggleFilter}
                onClear={clearFilters}
              />
            )}

            <Popover position="bottom-end" withinPortal shadow="md">
              <Popover.Target>
                <ListPageButton aria-label="Display settings">
                  <IconAdjustments size={13} stroke={1.75} />
                  Display
                </ListPageButton>
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
                  {entity === "tickets" && (
                    <>
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
                    </>
                  )}
                  {entity === "epics" && (
                    <Text size="xs" className="text-text-muted">Display settings for epics coming soon.</Text>
                  )}
                </Popover.Dropdown>
            </Popover>

            <ListPagePrimaryButton
              onClick={() => {
                if (entity === "epics") {
                  setEpicModalOpened(true);
                } else {
                  setModalOpened(true);
                }
              }}
              disabled={!product}
            >
              <IconPlus size={13} stroke={2.5} />
              {entity === "epics" ? "New epic" : "New ticket"}
            </ListPagePrimaryButton>
          </>
        }
      />

      {/* Content */}
      {entity === "epics" ? (
        <div className="px-8 py-4">
          {view === "timeline" ? (
            <div className="border border-border-primary rounded-lg p-8 flex items-center justify-center min-h-[200px]">
              <Text size="sm" className="text-text-muted">Timeline view coming soon</Text>
            </div>
          ) : (
            <EpicsList epics={epics ?? []} search={search} basePath={epicsBasePath} view={view === "list" ? "list" : "table"} />
          )}
        </div>
      ) : (isLoading || sessionPending) ? (
        <Stack gap="xs" className="px-8 py-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={36} />)}
        </Stack>
      ) : (activeTickets.length > 0 || completedTickets.length > 0) ? (
        view === "board" ? (
          <div className="px-8 py-4">
            <TicketKanbanBoard
              tickets={sorted as Array<{ id: string; shortId: string | null; number: number; title: string; status: TicketStatus; priority: number | null; type: string; assignee: { id: string; name: string | null; image: string | null } | null; feature: { id: string; name: string } | null; epic: { id: string; name: string } | null; openBlockerCount: number; isBlocked: boolean }>}
              productId={product?.id ?? ""}
              productName={product?.name ?? ""}
              funTicketIds={product?.funTicketIds ?? false}
              basePath={basePath}
              selection={{ isSelected: sel.isSelected, toggle: sel.toggle }}
              onOpenTicket={(id) => setPeek(id)}
            />
          </div>
        ) : view === "list" ? (
          <div>
            {groups.map((group) => (
              groupBy === "none" ? (
                <div key={group.key}>{group.items.map(renderListItem)}</div>
              ) : (
                <React.Fragment key={`group-${group.key}`}>
                  <div
                    className="group/row bg-surface-secondary/50 px-8 pt-4 pb-2 border-b border-border-primary cursor-pointer select-none flex items-center gap-1.5"
                    onClick={() => toggleCollapsed(group.key)}
                  >
                    {renderGroupChevron(group.items.map((t) => t.id), group.key)}
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
                  className="group/row bg-surface-secondary/50 px-8 pt-4 pb-2 border-b border-border-primary cursor-pointer select-none flex items-center gap-1.5"
                  onClick={() => toggleCollapsed("__completed")}
                >
                  {renderGroupChevron(completedTickets.map((t) => t.id), "__completed")}
                  <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wide">Completed</Text>
                  <Badge size="xs" variant="light">{completedTickets.length}</Badge>
                </div>
                {!collapsed.has("__completed") && completedTickets.map(renderListItem)}
              </>
            )}
          </div>
        ) : (
        <div className={table.tableWrap}>
          <table className={table.table}>
            <thead className={table.tableHead}>
              <tr>
                {vc.has("id") && (
                  <th style={{ width: 104 }} className="group/row">
                    <SelectSlot
                      selected={visibleIds.length > 0 && visibleIds.every((id) => sel.selected.has(id))}
                      indeterminate={sel.anySelected && !visibleIds.every((id) => sel.selected.has(id))}
                      onToggle={() =>
                        sel.setMany(
                          visibleIds,
                          !(visibleIds.length > 0 && visibleIds.every((id) => sel.selected.has(id))),
                        )
                      }
                    >
                      ID
                    </SelectSlot>
                  </th>
                )}
                <SortHeader label="Title" field="title" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                {vc.has("status") && <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} width={170} />}
                {vc.has("priority") && <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={handleSort} width={130} />}
                {vc.has("type") && <SortHeader label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} width={150} />}
                {vc.has("dri") && <SortHeader label="DRI" field="assignee" sortField={sortField} sortDir={sortDir} onSort={handleSort} width={72} />}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                groupBy === "none" ? (
                  group.items.map(renderRow)
                ) : (
                  <React.Fragment key={`group-${group.key}`}>
                    {renderGroupRow(group.key, group.label, group.items.map((t) => t.id))}
                    {!collapsed.has(group.key) && group.items.map(renderRow)}
                  </React.Fragment>
                )
              ))}

              {/* Completed section */}
              {completedTickets.length > 0 && (
                <>
                  {renderGroupRow("__completed", "Completed", completedTickets.map((t) => t.id))}
                  {!collapsed.has("__completed") && completedTickets.map(renderRow)}
                </>
              )}
            </tbody>
          </table>
        </div>
        )
      ) : tickets && tickets.length > 0 ? (
        <div className={table.empty}>
          <span className="inline-flex items-center gap-3">
            No tickets match your{" "}
            {activeFilterCount > 0 && search.trim()
              ? "filters and search"
              : activeFilterCount > 0
                ? "filters"
                : "search"}
            .
            {activeFilterCount > 0 && (
              <ListPageButton onClick={clearFilters}>Clear filters</ListPageButton>
            )}
          </span>
        </div>
      ) : (
        <div className="px-8 py-6">
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
        </div>
      )}

      {entity === "tickets" && (
        <BulkActionBar count={sel.count} onClear={sel.clear}>
          <BulkActionMenu label="Status">
            {TICKET_STATUSES.map((s) => (
              <Menu.Item key={s.value} onClick={() => applyBulk({ status: s.value })}>
                <div className="flex items-center gap-2">
                  <Badge size="xs" variant="filled" color={s.color} styles={{ label: { color: "var(--mantine-color-dark-9)" } }} />
                  {s.label}
                </div>
              </Menu.Item>
            ))}
          </BulkActionMenu>
          <BulkActionMenu label="Priority">
            {[0, 1, 2, 3, 4].map((p) => (
              <Menu.Item
                key={p}
                leftSection={<PriorityIcon priority={p} size={14} />}
                onClick={() => applyBulk({ priority: p })}
              >
                {PRIORITY_LABELS[p]}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item onClick={() => applyBulk({ priority: null })}>No priority</Menu.Item>
          </BulkActionMenu>
          <BulkActionMenu label="Type">
            {(["BUG", "FEATURE", "CHORE", "IMPROVEMENT", "SPIKE", "RESEARCH"] as const).map((t) => (
              <Menu.Item key={t} onClick={() => applyBulk({ type: t })}>
                <Badge size="xs" variant="light" color={TYPE_COLORS[t] ?? "gray"}>
                  {t.toLowerCase()}
                </Badge>
              </Menu.Item>
            ))}
          </BulkActionMenu>
          <BulkActionMenu label="DRI">
            {members.map((m) => (
              <Menu.Item key={m.id} onClick={() => applyBulk({ assigneeId: m.id })}>
                {m.name ?? "Unnamed"}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item onClick={() => applyBulk({ assigneeId: null })}>Unassigned</Menu.Item>
          </BulkActionMenu>
          <BulkActionMenu label="Epic">
            {(epics ?? []).map((e) => (
              <Menu.Item key={e.id} onClick={() => applyBulk({ epicId: e.id })}>
                {e.name}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item onClick={() => applyBulk({ epicId: null })}>No epic</Menu.Item>
          </BulkActionMenu>
          <BulkActionMenu label="Cycle">
            {(cycles ?? []).map((c) => (
              <Menu.Item key={c.id} onClick={() => applyBulk({ cycleId: c.id })}>
                {c.name}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item onClick={() => applyBulk({ cycleId: null })}>No cycle</Menu.Item>
          </BulkActionMenu>
          <div className="h-4 w-px bg-border-primary" />
          <Button
            variant="subtle"
            size="compact-xs"
            color="red"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Delete
          </Button>
        </BulkActionBar>
      )}

      <Modal
        opened={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={`Delete ${sel.count} ticket${sel.count === 1 ? "" : "s"}?`}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-secondary">
            This permanently deletes the selected ticket{sel.count === 1 ? "" : "s"}, including comments and dependencies. This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={bulkDelete.isPending}
              onClick={() => bulkDelete.mutate({ ids: Array.from(sel.selected) })}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

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
          members={workspace?.members?.map((m: { user: { id: string; name: string | null } }) => ({ id: m.user.id, name: m.user.name })) ?? []}
        />
      )}

      {product && editTicketId && (
        <EditTicketModal
          opened={editTicketId !== null}
          onClose={() => setEditTicketId(null)}
          ticketId={editTicketId}
          productName={product.name}
          workspaceId={workspaceId ?? undefined}
          assignableMembers={workspace?.members?.map((m: { user: { id: string; name: string | null } }) => ({ id: m.user.id, name: m.user.name })) ?? []}
        />
      )}

      <CreateEpicModal
        opened={epicModalOpened}
        onClose={() => setEpicModalOpened(false)}
        workspaceId={workspaceId ?? ""}
        productId={product?.id}
      />

      {/* Peek drawer - detail over the list, list stays mounted */}
      <PeekDrawer
        label="Ticket details"
        opened={!!peekId}
        onClose={() => setPeek(null)}
        fullPageHref={peekId ? `${basePath}/${peekId}` : null}
        onPrev={peekPrev}
        onNext={peekNext}
      >
        {peekId && <TicketPeek ticketId={peekId} basePath={basePath} />}
      </PeekDrawer>
    </div>
  );
}
