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
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAdjustments,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFilter,
  IconLayoutColumns,
  IconLayoutList,
  IconList,
  IconPencil,
  IconPlus,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
  IconTicket,
  IconX,
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
import { PriorityIcon, PRIORITY_LABELS as PRIORITY_LABEL_MAP } from "~/app/_components/product/PriorityIcon";
import { NotionSyncBadge } from "~/app/_components/product/NotionSyncBadge";
import { BlockedIndicator } from "~/app/_components/product/TicketDependenciesSection";
import { EpicsList } from "~/app/_components/product/EpicsList";
import { TagBadge } from "~/app/_components/TagBadge";
import {
  groupTickets,
  GROUP_BY_OPTIONS,
  type GroupByField,
} from "./ticketGrouping";
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
// Create Epic Modal
// ---------------------------------------------------------------------------

function CreateEpicModal({ opened, onClose, workspaceId }: { opened: boolean; onClose: () => void; workspaceId: string }) {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createEpic = api.epic.create.useMutation({
    onSuccess: async () => {
      await utils.epic.list.invalidate();
      onClose();
      setName("");
      setDescription("");
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="New epic" size="md">
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="Epic name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          size="sm"
          required
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="What does this epic cover?"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={5}
          size="sm"
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createEpic.mutate({ workspaceId, name: name.trim(), description: description.trim() || undefined })}
            loading={createEpic.isPending}
            disabled={!name.trim()}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

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
          styles={{ label: { color: "var(--mantine-color-dark-9)" } }}
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
              <Badge size="xs" variant="filled" color={STATUS_COLORS[s] ?? "gray"} styles={{ label: { color: "var(--mantine-color-dark-9)" } }} />
              {STATUS_LABELS[s]}
            </div>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
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
        <Tooltip label="Filter" position="bottom">
          <ActionIcon
            variant="subtle"
            size="sm"
            className="text-text-muted hover:text-text-primary rounded-none"
            style={{ height: 30, width: 30, position: "relative" }}
            aria-label="Filter tickets"
          >
            <IconFilter size={15} />
            {activeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-primary px-1 text-[9px] font-semibold text-white">
                {activeCount}
              </span>
            )}
          </ActionIcon>
        </Tooltip>
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback((prefs: Record<string, unknown>) => {
    if (!workspaceId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMutateRef.current({ productSlug, workspaceId, prefs: prefs as { view?: string; groupBy?: string; sortField?: string; sortDir?: string; visibleColumns?: string[]; entity?: "tickets" | "epics"; filters?: TicketFilters } });
    }, 500);
  }, [workspaceId, productSlug]);

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

  // Clear only the overview deep-link params; keep any other query params.
  const clearUrlFilters = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("status");
    next.delete("assignee");
    const qs = next.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath);
  };

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
      className={`group/row flex items-center gap-3 px-3 py-2 transition-colors cursor-pointer border-b border-border-primary ${sel.isSelected(ticket.id) ? "bg-surface-hover" : "hover:bg-surface-hover"}`}
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
  const colCount = vc.size;
  // The table's checkbox swap-slot lives in the first hideable leading column
  // (ID, else Status). With both hidden, selection still works via
  // cmd/ctrl/shift-click - we never add a dedicated column, so the layout
  // never changes.
  const swapCol = vc.has("id") ? "id" : vc.has("status") ? "status" : null;

  // Shared row renderer
  const renderRow = (ticket: (typeof sorted)[number]) => (
    <Table.Tr
      key={ticket.id}
      className={`group/row cursor-pointer transition-colors ${sel.isSelected(ticket.id) ? "bg-surface-hover" : "hover:bg-surface-hover"}`}
      {...rowClickHandlers(ticket.id, () => setPeek(ticket.id))}
    >
      {vc.has("id") && (
        <Table.Td style={{ width: 70 }}>
          <SelectSlot
            selected={sel.isSelected(ticket.id)}
            onToggle={() => sel.toggle(ticket.id)}
            onRangeToggle={() => sel.selectRange(ticket.id, visibleIds)}
          >
            <Text size="xs" className="text-text-muted font-mono" lineClamp={1}>
              {product?.funTicketIds && ticket.shortId ? ticket.shortId : (ticket.number > 0 && product ? generateLinearId(product.name, ticket.number) : null)}
            </Text>
          </SelectSlot>
        </Table.Td>
      )}
      {vc.has("status") && (
        <Table.Td style={{ width: 110 }}>
          {swapCol === "status" ? (
            <SelectSlot
              selected={sel.isSelected(ticket.id)}
              onToggle={() => sel.toggle(ticket.id)}
              onRangeToggle={() => sel.selectRange(ticket.id, visibleIds)}
            >
              <StatusCell
                status={ticket.status}
                onUpdate={(s) => handleStatusChange(ticket.id, s)}
              />
            </SelectSlot>
          ) : (
            <StatusCell
              status={ticket.status}
              onUpdate={(s) => handleStatusChange(ticket.id, s)}
            />
          )}
        </Table.Td>
      )}
      {vc.has("title") && (
        <Table.Td>
          <div className="flex items-center gap-2 min-w-0">
            <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
              {ticket.title}
            </Text>
            <BlockedIndicator
              openBlockerCount={ticket.openBlockerCount}
              isBlocked={ticket.isBlocked}
            />
          </div>
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
      {vc.has("type") && (
        <Table.Td style={{ width: 90 }}>
          <Badge size="xs" variant="light" color={TYPE_COLORS[ticket.type] ?? "gray"}>
            {ticket.type.toLowerCase()}
          </Badge>
        </Table.Td>
      )}
      {vc.has("labels") && (
        <Table.Td style={{ width: 140 }}>
          {ticket.tags && ticket.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {ticket.tags.slice(0, 2).map((t: { tag: { id: string; name: string; color: string } }) => (
                <TagBadge key={t.tag.id} tag={t.tag} size="xs" />
              ))}
              {ticket.tags.length > 2 && (
                <Text size="xs" className="text-text-muted">+{ticket.tags.length - 2}</Text>
              )}
            </div>
          ) : (
            <Text size="xs" className="text-text-muted">-</Text>
          )}
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
          data={entity === "epics" ? [
            { value: "table", label: (<Tooltip label="Table" position="bottom"><div className="flex items-center justify-center px-1"><IconLayoutList size={15} /></div></Tooltip>) },
            { value: "timeline", label: (<Tooltip label="Timeline" position="bottom"><div className="flex items-center justify-center px-1"><IconLayoutColumns size={15} /></div></Tooltip>) },
            { value: "list", label: (<Tooltip label="List" position="bottom"><div className="flex items-center justify-center px-1"><IconList size={15} /></div></Tooltip>) },
          ] : [
            { value: "table", label: (<Tooltip label="Table" position="bottom"><div className="flex items-center justify-center px-1"><IconLayoutList size={15} /></div></Tooltip>) },
            { value: "board", label: (<Tooltip label="Board" position="bottom"><div className="flex items-center justify-center px-1"><IconLayoutColumns size={15} /></div></Tooltip>) },
            { value: "list", label: (<Tooltip label="List" position="bottom"><div className="flex items-center justify-center px-1"><IconList size={15} /></div></Tooltip>) },
          ]}
          styles={{ root: { backgroundColor: "var(--color-surface-secondary)", border: "1px solid var(--color-border-primary)" } }}
        />

        <Menu position="bottom-start" shadow="md">
          <Menu.Target>
            <UnstyledButton
              className="flex items-center gap-0.5 text-text-muted hover:text-text-primary transition-colors"
              title="Switch entity"
            >
              <Text size="xs">
                {entity === "epics" ? "Epics" : "Tickets"}
              </Text>
              <IconChevronDown size={12} />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() => { setEntity("tickets"); debouncedSave({ entity: "tickets" }); }}
            >
              Tickets
            </Menu.Item>
            <Menu.Item
              onClick={() => { setEntity("epics"); debouncedSave({ entity: "epics" }); }}
            >
              Epics
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {(urlStatus ?? filterAssigneeMe) && (
          <Badge
            variant="light"
            color={urlStatus ? STATUS_COLORS[urlStatus] : "brand"}
            rightSection={
              <ActionIcon
                variant="transparent"
                size="xs"
                color="gray"
                aria-label="Clear filter"
                onClick={clearUrlFilters}
              >
                <IconX size={11} />
              </ActionIcon>
            }
          >
            {[
              urlStatus ? STATUS_LABELS[urlStatus] : null,
              filterAssigneeMe ? "My tickets" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Badge>
        )}

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
          <FilterPopover
            facetOptions={facetOptions}
            filters={filters}
            activeCount={activeFilterCount}
            onToggle={toggleFilter}
            onClear={clearFilters}
          />
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
        </div>

        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            if (entity === "epics") {
              setEpicModalOpened(true);
            } else {
              setModalOpened(true);
            }
          }}
          disabled={!product}
          variant="light"
          styles={{ root: { height: 30, paddingLeft: 10, paddingRight: 12, fontSize: "0.8rem", minWidth: 110 } }}
        >
          {entity === "epics" ? "New epic" : "New ticket"}
        </Button>
      </div>

      {/* Content */}
      {entity === "epics" ? (
        view === "timeline" ? (
          <div className="border border-border-primary rounded-lg p-8 flex items-center justify-center min-h-[200px]">
            <Text size="sm" className="text-text-muted">Timeline view coming soon</Text>
          </div>
        ) : (
          <EpicsList epics={epics ?? []} search={search} basePath={basePath} view={view === "list" ? "list" : "table"} />
        )
      ) : (isLoading || sessionPending) ? (
        <Stack gap="xs">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={36} />)}
        </Stack>
      ) : (activeTickets.length > 0 || completedTickets.length > 0) ? (
        view === "board" ? (
          <TicketKanbanBoard
            tickets={sorted as Array<{ id: string; shortId: string | null; number: number; title: string; status: TicketStatus; priority: number | null; type: string; assignee: { id: string; name: string | null; image: string | null } | null; feature: { id: string; name: string } | null; epic: { id: string; name: string } | null; openBlockerCount: number; isBlocked: boolean }>}
            productId={product?.id ?? ""}
            productName={product?.name ?? ""}
            funTicketIds={product?.funTicketIds ?? false}
            basePath={basePath}
            selection={{ isSelected: sel.isSelected, toggle: sel.toggle }}
            onOpenTicket={(id) => setPeek(id)}
          />
        ) : view === "list" ? (
          <div className="border border-border-primary rounded-lg overflow-hidden">
            {groups.map((group) => (
              groupBy === "none" ? (
                <div key={group.key}>{group.items.map(renderListItem)}</div>
              ) : (
                <React.Fragment key={`group-${group.key}`}>
                  <div
                    className="group/row bg-surface-secondary/50 px-3 pt-4 pb-2 border-b border-border-primary cursor-pointer select-none flex items-center gap-1.5"
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
                  className="group/row bg-surface-secondary/50 px-3 pt-4 pb-2 border-b border-border-primary cursor-pointer select-none flex items-center gap-1.5"
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
                {vc.has("id") && (
                  <Table.Th style={{ width: 70 }} className="group/row">
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
                      <span className="text-text-muted">ID</span>
                    </SelectSlot>
                  </Table.Th>
                )}
                {vc.has("status") && <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("title") && <SortHeader label="Title" field="title" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("priority") && <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("dri") && <SortHeader label="DRI" field="assignee" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("type") && <SortHeader label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                {vc.has("labels") && <Table.Th style={{ width: 140 }}><span className="text-text-muted">Labels</span></Table.Th>}
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
                      className="group/row cursor-pointer select-none"
                      onClick={() => toggleCollapsed(group.key)}
                    >
                      <Table.Td
                        colSpan={colCount}
                        className="bg-surface-secondary/50"
                        style={{ paddingTop: 16, paddingBottom: 8 }}
                      >
                        <div className="flex items-center gap-1.5">
                          {renderGroupChevron(group.items.map((t) => t.id), group.key)}
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
                    className="group/row cursor-pointer select-none"
                    onClick={() => toggleCollapsed("__completed")}
                  >
                    <Table.Td
                      colSpan={colCount}
                      className="bg-surface-secondary/50"
                      style={{ paddingTop: 16, paddingBottom: 8 }}
                    >
                      <div className="flex items-center gap-1.5">
                        {renderGroupChevron(completedTickets.map((t) => t.id), "__completed")}
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
          No tickets match your{" "}
          {activeFilterCount > 0 && search.trim()
            ? "filters and search"
            : activeFilterCount > 0
              ? "filters"
              : "search"}
          .
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
      />

      {/* Peek drawer - detail over the list, list stays mounted */}
      <PeekDrawer
        opened={!!peekId}
        onClose={() => setPeek(null)}
        fullPageHref={peekId ? `${basePath}/${peekId}` : null}
        onPrev={peekPrev}
        onNext={peekNext}
      >
        {peekId && <TicketPeek ticketId={peekId} basePath={basePath} />}
      </PeekDrawer>
    </Stack>
  );
}
