"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Popover,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAdjustments,
  IconBulb,
  IconEdit,
  IconLayoutGrid,
  IconList,
  IconMap2,
  IconPlus,
} from "@tabler/icons-react";
import { Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { EditFeatureModal } from "~/app/_components/product/EditFeatureModal";
import { CreateFeatureModal } from "~/app/_components/product/CreateFeatureModal";
import {
  useMultiSelect,
  SelectSlot,
  CardSelectCheckbox,
  HeaderSelectCheckbox,
  BulkActionBar,
  BulkActionMenu,
  buildUndoGroups,
} from "~/app/_components/shared/multiSelect";
import { PeekDrawer } from "~/app/_components/product/peek/PeekDrawer";
import { FeaturePeek } from "~/app/_components/product/peek/FeaturePeek";
import {
  FEATURE_STATUSES,
  FEATURE_STATUS_LABELS as STATUS_LABELS,
  FEATURE_STATUS_ORDER as STATUS_ORDER,
  FEATURE_STATUS_COLORS as STATUS_COLORS,
  type FeatureStatus,
} from "~/lib/feature-statuses";
import {
  PRIORITY_PILL_OPTIONS,
  priorityFromPillValue,
  priorityPillColor,
  priorityPillValue,
} from "~/app/_components/product/priorityPill";
import {
  ListPageTopBar,
  ListPageViewTabs,
  ListPageSearch,
  ListPageButton,
  ListPagePrimaryButton,
  ListPageFilterPills,
  ListPageFilterPopover,
  PillSelect,
} from "~/app/_components/listPage";
import type { ListPageFilterPill } from "~/app/_components/listPage";
import table from "~/app/_components/listPage/DataTable.module.css";
import { usePageSearchHotkey } from "~/hooks/usePageSearchHotkey";
import { useCoalescedSave } from "~/hooks/useCoalescedSave";
import {
  buildFeatureFacetOptions,
  countActiveFeatureFilters,
  goalTitleForFilterValue,
  matchesFeatureFilters,
  parseSavedFeatureFilters,
  EMPTY_FEATURE_FILTERS,
  FEATURE_FILTER_FACETS,
  FILTER_NONE,
  type FeatureFilterKey,
  type FeatureFilters,
} from "./featureFilters";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<number, string> = {
  0: "Urgent", 1: "High", 2: "Medium", 3: "Low", 4: "None",
};

const VIEW_TABS = [
  { value: "list", label: "List", icon: IconList },
  { value: "cards", label: "Cards", icon: IconLayoutGrid },
];

// Colours of the toolbar pills naming each applied filter (status pills take
// the status's own colour). Matches the Backlog's pills facet for facet.
const FACET_PILL_COLORS: Record<Exclude<FeatureFilterKey, "status">, string> = {
  priority: "grape", area: "indigo", goal: "cyan", labels: "teal",
};

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type SortField = "status" | "name" | "priority" | "scopes" | "tickets";
type SortDir = "asc" | "desc";

function cmp(a: string | number, b: string | number, dir: SortDir) {
  if (a < b) return dir === "asc" ? -1 : 1;
  if (a > b) return dir === "asc" ? 1 : -1;
  return 0;
}

function sortValue(f: Record<string, unknown>, field: SortField): string | number {
  switch (field) {
    case "status": return STATUS_ORDER[(f.status as string) ?? ""] ?? 99;
    case "name": return ((f.name as string) ?? "").toLowerCase();
    case "priority": return (f.priority as number) ?? 99;
    case "scopes": return (f._count as { scopes?: number })?.scopes ?? 0;
    case "tickets": return (f._count as { tickets?: number })?.tickets ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Group by
// ---------------------------------------------------------------------------

type GroupByField = "none" | "status" | "priority" | "area";

const GROUP_BY_OPTIONS = [
  { value: "none", label: "No grouping" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "area", label: "Area" },
];

function groupKey(f: Record<string, unknown>, field: GroupByField): string {
  switch (field) {
    case "status": return (f.status as string) ?? "UNKNOWN";
    case "priority": return f.priority != null ? String(f.priority as number) : "unset";
    // Real Area relation (Features V2) - replaces the old category:"area" tag
    // stopgap.
    case "area": return (f.area as { name: string } | null)?.name ?? "No area";
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
// Page
// ---------------------------------------------------------------------------

export default function FeaturesListPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [editFeatureId, setEditFeatureId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField] = useState<SortField>("status");
  const [sortDir] = useState<SortDir>("asc");
  const [view, setView] = useState("list");
  // The registry default: features grouped by Area - the product's carve.
  const [groupBy, setGroupBy] = useState<GroupByField>("area");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [filters, setFilters] = useState<FeatureFilters>(EMPTY_FEATURE_FILTERS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  usePageSearchHotkey(searchRef);
  const utils = api.useUtils();

  // ── Saved filters (per user, per product) ──
  // Keyed apart from the Backlog's prefs for the same product, like Insights.
  const prefsInput = useMemo(
    () => ({ productSlug: `${productSlug}/features`, workspaceId: workspaceId ?? "" }),
    [productSlug, workspaceId],
  );
  const { data: savedPrefs, isError: prefsFailed } =
    api.product.product.getViewPrefs.useQuery(prefsInput, { enabled: !!workspaceId });
  // The features wait for the saved filters, as the Backlog's tickets do: a
  // list that arrives first would render unfiltered, then shrink when the
  // prefs land. A failed prefs read falls back to no filters.
  const awaitingPrefs = !prefsLoaded && !prefsFailed;

  const savePrefs = api.product.product.saveViewPrefs.useMutation();
  const saveMutateRef = useRef(savePrefs.mutate);
  saveMutateRef.current = savePrefs.mutate;

  const { push: debouncedSave } = useCoalescedSave<{ filters: FeatureFilters }>(
    useCallback((prefs: Partial<{ filters: FeatureFilters }>) => {
      if (!prefsInput.workspaceId) return;
      // Keep the cached prefs in step with what was saved: coming back to this
      // tab remounts the page, which restores from that cache.
      utils.product.product.getViewPrefs.setData(prefsInput, (prev) => ({ ...prev, ...prefs }));
      saveMutateRef.current({ ...prefsInput, prefs });
    }, [prefsInput, utils]),
  );

  useEffect(() => {
    if (savedPrefs && !prefsLoaded) {
      setFilters(parseSavedFeatureFilters(savedPrefs.filters));
      setPrefsLoaded(true);
    }
  }, [savedPrefs, prefsLoaded]);

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: features, isLoading } = api.product.feature.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: areas } = api.product.feature.listAreas.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  // ── Multi-select ──
  const sel = useMultiSelect();
  const selClear = sel.clear;
  // Selection survives the list ↔ cards switch; it clears when the item set
  // changes meaning (filters, search, product).
  useEffect(() => {
    selClear();
  }, [selClear, search, filters, productSlug]);

  type BulkPatch = {
    status?: FeatureStatus;
    priority?: number | null;
    areaId?: string | null;
  };

  const listInput = { productId: product?.id ?? "" };

  // Optimistic: patch the cached list immediately, roll back on error. Shared
  // by the bulk bar and the rows' in-place pills, which each get their own
  // mutation hook: TanStack keeps only the latest mutate() call's per-call
  // callbacks, so sharing one hook let a row edit swallow a concurrent bulk
  // update's Undo toast (and vice versa).
  const useOptimisticFeaturePatch = (
    onSuccess?: (res: { updated: number; skipped: number }) => void,
  ) =>
    api.product.feature.bulkUpdate.useMutation({
      onSuccess,
      onMutate: async (vars) => {
        await utils.product.feature.list.cancel(listInput);
        const prev = utils.product.feature.list.getData(listInput);
        if (prev) {
          const idSet = new Set(vars.ids);
          utils.product.feature.list.setData(
            listInput,
            prev.map((f) => {
              if (!idSet.has(f.id)) return f;
              const next = { ...f };
              // Status on a feature with scopes may be scope-derived - the
              // server can skip it, so don't predict it optimistically.
              if (vars.status !== undefined && f._count.scopes === 0) {
                next.status = vars.status;
              }
              if (vars.priority !== undefined) next.priority = vars.priority;
              if (vars.areaId !== undefined) {
                const a = (areas ?? []).find((x) => x.id === vars.areaId);
                next.area =
                  vars.areaId && a
                    ? { id: a.id, name: a.name, displayOrder: a.displayOrder }
                    : null;
              }
              return next;
            }),
          );
        }
        return { prev };
      },
      onError: (_err, _vars, mctx) => {
        if (mctx?.prev) utils.product.feature.list.setData(listInput, mctx.prev);
        notifications.show({
          title: "Bulk update failed",
          message: "Your changes were not saved. Please try again.",
          color: "red",
        });
      },
      onSettled: async () => {
        if (product?.id) {
          await utils.product.feature.list.invalidate({ productId: product.id });
        }
      },
    });

  const bulkUpdate = useOptimisticFeaturePatch();

  // In-place Status / Priority edits from the table's pill selects. Goes
  // through bulkUpdate for its status guard: a feature whose status follows
  // its scopes (or that has been live) is skipped server-side, and the toast
  // says why nothing changed.
  const inlineUpdate = useOptimisticFeaturePatch((res) => {
    if (res.skipped > 0) {
      notifications.show({
        title: "Status not changed",
        message: "This feature's status follows its scopes, or it has already been live.",
        color: "yellow",
      });
    }
  });

  // Bulk hard delete - confirmed via modal (no undo for deletes).
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const bulkDelete = api.product.feature.bulkDelete.useMutation({
    onSuccess: async (res) => {
      setConfirmDeleteOpen(false);
      selClear();
      notifications.show({
        message: `Deleted ${res.count} feature${res.count === 1 ? "" : "s"}`,
      });
      if (product?.id) {
        await utils.product.feature.list.invalidate({ productId: product.id });
      }
    },
    onError: () => {
      notifications.show({
        title: "Delete failed",
        message: "The features were not deleted. Please try again.",
        color: "red",
      });
    },
  });

  // Apply a uniform patch to every selected feature, with an Undo toast that
  // restores the previous values. The server may skip features whose status
  // is scope-derived or lifecycle-guarded; the toast reports that.
  const applyBulk = (patch: BulkPatch) => {
    const ids = Array.from(sel.selected);
    if (ids.length === 0) return;
    const affected = (features ?? []).filter((f) => sel.selected.has(f.id));
    const undoGroups = buildUndoGroups(affected, (f) => {
      const prev: Record<string, unknown> = {};
      if (patch.status !== undefined) prev.status = f.status;
      if (patch.priority !== undefined) prev.priority = f.priority ?? null;
      if (patch.areaId !== undefined) prev.areaId = f.area?.id ?? null;
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
                  Updated {res.updated} feature{res.updated === 1 ? "" : "s"}
                  {res.skipped > 0
                    ? ` · ${res.skipped} skipped (status derived from scopes or lifecycle-protected)`
                    : ""}
                </Text>
                {res.updated > 0 && (
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
                )}
              </Group>
            ),
            autoClose: 8000,
          });
        },
      },
    );
  };

  const updateOne = (featureId: string, patch: BulkPatch) => {
    inlineUpdate.mutate({ ids: [featureId], ...patch });
  };

  // ── Filters ──
  const facetOptions = useMemo(() => buildFeatureFacetOptions(features ?? []), [features]);
  const activeFilterCount = countActiveFeatureFilters(filters);

  const toggleFilter = (key: FeatureFilterKey, value: string) => {
    setFilters((prev) => {
      const cur = prev[key];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const updated = { ...prev, [key]: next };
      debouncedSave({ filters: updated });
      return updated;
    });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FEATURE_FILTERS);
    debouncedSave({ filters: EMPTY_FEATURE_FILTERS });
  };

  // Filter + sort
  const sorted = useMemo(() => {
    if (!features) return [];
    const q = search.toLowerCase().trim();
    const list = features.filter(
      (f) =>
        matchesFeatureFilters(f, filters) &&
        (!q ||
          f.name.toLowerCase().includes(q) ||
          f.status.toLowerCase().includes(q) ||
          (f.description ?? "").toLowerCase().includes(q)),
    );
    list.sort((a, b) =>
      cmp(
        sortValue(a as unknown as Record<string, unknown>, sortField),
        sortValue(b as unknown as Record<string, unknown>, sortField),
        sortDir,
      ),
    );
    return list;
  }, [features, search, filters, sortField, sortDir]);

  // Group
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", items: sorted }];
    const map = new Map<string, typeof sorted>();
    for (const f of sorted) {
      const k = groupKey(f as unknown as Record<string, unknown>, groupBy);
      const arr = map.get(k);
      if (arr) arr.push(f);
      else map.set(k, [f]);
    }
    const entries = Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: groupLabel(key, groupBy),
      items,
    }));
    // Area groups follow the product's own ordering; unsorted features last.
    if (groupBy === "area") {
      const orderOf = (g: (typeof entries)[number]) =>
        g.key === "No area"
          ? Number.MAX_SAFE_INTEGER
          : (g.items[0]?.area?.displayOrder ?? Number.MAX_SAFE_INTEGER - 1);
      entries.sort((a, b) => orderOf(a) - orderOf(b));
    }
    return entries;
  }, [sorted, groupBy]);

  // Visible row order for shift-click range selection.
  const visibleIds = useMemo(
    () => groups.flatMap((g) => g.items.map((f) => f.id)),
    [groups],
  );

  // ── Peek drawer (?peek=<id>) - detail-over-list, the list never unmounts ──
  const peekBasePath = `/w/${workspace?.slug ?? ""}/products/${productSlug}/features`;
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
  const basePath = `/w/${workspace.slug}/products/${productSlug}/features`;

  // One toolbar pill per applied filter value. A saved filter can name an
  // area, goal or label no loaded feature carries any more (deleted, or moved
  // off every feature), so the fallback says so instead of showing a raw id.
  const facetPillLabel = (key: FeatureFilterKey, value: string): string => {
    const fromFacets = facetOptions[key].find((o) => o.value === value)?.label;
    switch (key) {
      case "status": return STATUS_LABELS[value] ?? value;
      case "priority":
        return value === FILTER_NONE ? "No priority" : `${PRIORITY_LABELS[Number(value)] ?? value} priority`;
      case "area":
        if (value === FILTER_NONE) return "No area";
        return `Area: ${(areas ?? []).find((a) => a.id === value)?.name ?? fromFacets ?? "Unknown area"}`;
      case "goal":
        if (value === FILTER_NONE) return "No goal";
        return `Goal: ${goalTitleForFilterValue(features ?? [], value) ?? "Unknown goal"}`;
      case "labels":
        return fromFacets ?? "Unknown label";
    }
  };
  // Saved filters wait for the features: goals and labels only resolve from
  // them, and a flash of "Unknown label" on every load is noise.
  const filterPills: ListPageFilterPill[] = (features ? FEATURE_FILTER_FACETS : []).flatMap(
    (facet) =>
      filters[facet.key].map((value) => ({
        key: `${facet.key}-${value}`,
        label: facetPillLabel(facet.key, value),
        color:
          facet.key === "status"
            ? (STATUS_COLORS[value] ?? "gray")
            : FACET_PILL_COLORS[facet.key],
        onRemove: () => toggleFilter(facet.key, value),
      })),
  );

  // Selection handlers shared by list rows and cards (both are Links):
  // cmd/ctrl-click toggles, shift-click range-selects, plain click peeks
  // (middle-click still opens the full page in a new tab via the href).
  const itemClickHandlers = (featureId: string) => ({
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        sel.toggle(featureId);
        return;
      }
      if (e.shiftKey) {
        e.preventDefault();
        sel.selectRange(featureId, visibleIds);
        return;
      }
      e.preventDefault();
      setPeek(featureId);
    },
    onMouseDown: (e: React.MouseEvent) => {
      // Keep shift-click from starting a text selection.
      if (e.shiftKey) e.preventDefault();
    },
  });

  // Group-header select-all checkbox (right edge, hover-revealed).
  const renderGroupHeaderCheckbox = (ids: string[]) => {
    const selectedCount = ids.filter((id) => sel.selected.has(id)).length;
    const all = ids.length > 0 && selectedCount === ids.length;
    const some = selectedCount > 0 && !all;
    return (
      <HeaderSelectCheckbox
        selected={all}
        indeterminate={some}
        onToggle={() => sel.setMany(ids, !all)}
      />
    );
  };

  // Pill selects and the edit button sit inside a clickable row: stop their
  // clicks (including the portalled dropdown's, which bubble through React)
  // from also opening the peek.
  const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();
  const showAreaColumn = groupBy !== "area";
  const colCount = showAreaColumn ? 5 : 4;

  // Table row renderer
  const renderRow = (feature: (typeof sorted)[number]) => {
    const handlers = itemClickHandlers(feature.id);
    return (
      <tr
        key={feature.id}
        className={`${table.tableRow} group/row`}
        data-clickable="true"
        data-selected={sel.isSelected(feature.id) ? "true" : "false"}
        {...handlers}
      >
        <td style={{ width: "100%", maxWidth: 0 }}>
          <div className={table.nameCell}>
            <SelectSlot
              className="shrink-0"
              selected={sel.isSelected(feature.id)}
              onToggle={() => sel.toggle(feature.id)}
              onRangeToggle={() => sel.selectRange(feature.id, visibleIds)}
            >
              <IconBulb size={16} className="text-text-muted" />
            </SelectSlot>
            <div className="min-w-0">
              {/* A real link so middle-click opens the full page in a new
                  tab; a plain click peeks (handled here, not by the row). */}
              <Link
                href={`${basePath}/${feature.id}`}
                className={`${table.nameText} block`}
                onClick={(e) => {
                  e.stopPropagation();
                  handlers.onClick(e);
                }}
              >
                {feature.name}
              </Link>
              <div className={table.nameSub}>
                {feature._count.scopes} scopes · {feature._count.tickets} tickets
              </div>
            </div>
          </div>
        </td>
        <td style={{ width: 170 }}>
          <div onClick={stopRowClick} style={{ width: 150 }}>
            <PillSelect
              value={feature.status}
              data={FEATURE_STATUSES}
              color={STATUS_COLORS[feature.status] ?? "gray"}
              aria-label="Status"
              onChange={(v) => updateOne(feature.id, { status: v as FeatureStatus })}
            />
          </div>
        </td>
        <td style={{ width: 130 }}>
          <div onClick={stopRowClick} style={{ width: 110 }}>
            <PillSelect
              value={priorityPillValue(feature.priority)}
              data={PRIORITY_PILL_OPTIONS}
              color={priorityPillColor(feature.priority)}
              aria-label="Priority"
              onChange={(v) => updateOne(feature.id, { priority: priorityFromPillValue(v) })}
            />
          </div>
        </td>
        {showAreaColumn && (
          <td style={{ width: 160 }}>
            <span className={table.muted}>{feature.area?.name ?? "—"}</span>
          </td>
        )}
        <td style={{ width: 72 }}>
          <button
            type="button"
            className="flex text-text-muted hover:text-brand-primary"
            aria-label="Edit feature"
            onClick={(e) => {
              stopRowClick(e);
              setEditFeatureId(feature.id);
            }}
          >
            <IconEdit size={18} />
          </button>
        </td>
      </tr>
    );
  };

  // Group-header row: the label, a count, and a hover select-all checkbox.
  const renderGroupRow = (key: string, label: string, ids: string[]) => (
    <tr key={`group-${key}`} className={`${table.groupRow} group/row`} style={{ cursor: "default" }}>
      <td colSpan={colCount} className="relative">
        <div className={table.groupLabel}>
          {label}
          <Badge size="xs" variant="light">{ids.length}</Badge>
        </div>
        {renderGroupHeaderCheckbox(ids)}
      </td>
    </tr>
  );

  // Card renderer
  const renderCard = (feature: (typeof sorted)[number]) => (
    <Card
      key={feature.id}
      component={Link}
      href={`${basePath}/${feature.id}`}
      className={`group/card relative border bg-surface-secondary transition-colors ${sel.isSelected(feature.id) ? "border-border-focus" : "border-border-primary hover:border-border-focus"}`}
      padding="lg"
      {...itemClickHandlers(feature.id)}
    >
      <CardSelectCheckbox
        selected={sel.isSelected(feature.id)}
        onToggle={() => sel.toggle(feature.id)}
        onRangeToggle={() => sel.selectRange(feature.id, visibleIds)}
      />
      <Group gap="xs" mb={8}>
        <Badge
          color={STATUS_COLORS[feature.status] ?? "gray"}
          variant="light"
          size="xs"
        >
          {STATUS_LABELS[feature.status] ?? feature.status}
        </Badge>
        {feature.priority != null && (
          <Badge variant="outline" size="xs" color="gray">
            {PRIORITY_LABELS[feature.priority]}
          </Badge>
        )}
      </Group>

      <Text fw={600} size="sm" className="text-text-primary" lineClamp={1}>
        {feature.name}
      </Text>

      {feature.description && (
        <Text size="xs" className="text-text-muted mt-1" lineClamp={2}>
          {feature.description}
        </Text>
      )}

      {feature.goal && (
        <Text size="xs" className="text-text-muted mt-2">
          &rarr; {feature.goal.title}
        </Text>
      )}

      <Group gap="md" mt="md">
        <Text size="xs" className="text-text-muted">
          {feature._count.scopes} scopes
        </Text>
        <Text size="xs" className="text-text-muted">
          {feature._count.tickets} tickets
        </Text>
      </Group>
    </Card>
  );

  return (
    <div className="flex flex-col">
      <ListPageTopBar
        left={
          <>
            <ListPageViewTabs
              aria-label="View"
              tabs={VIEW_TABS}
              active={view}
              onTabClick={setView}
            />
            <ListPageFilterPills pills={filterPills} onClearAll={clearFilters} />
          </>
        }
        actions={
          <>
            <ListPageSearch ref={searchRef} value={search} onChange={setSearch} />

            <ListPageFilterPopover
              aria-label="Filter features"
              facets={FEATURE_FILTER_FACETS}
              options={facetOptions}
              selected={filters}
              activeCount={activeFilterCount}
              onToggle={toggleFilter}
              onClear={clearFilters}
            />

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
                      minWidth: 260,
                    },
                  }}
                >
                  <div className="flex items-center justify-between gap-4 py-1">
                    <Text size="xs" className="text-text-muted whitespace-nowrap">Group by</Text>
                    <Select
                      value={groupBy}
                      onChange={(v) => v && setGroupBy(v as GroupByField)}
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
                  <div className="pt-2 border-t border-border-primary mt-2">
                    <Button
                      component={Link}
                      href={`/w/${workspace.slug}/products/${productSlug}/settings`}
                      size="xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconMap2 size={14} />}
                      fullWidth
                      styles={{ inner: { justifyContent: "flex-start" } }}
                    >
                      Manage areas in settings
                    </Button>
                  </div>
                </Popover.Dropdown>
            </Popover>

            <ListPagePrimaryButton onClick={() => setCreateModalOpen(true)} disabled={!product}>
              <IconPlus size={13} stroke={2.5} />
              New feature
            </ListPagePrimaryButton>
          </>
        }
      />

      {/* Content */}
      {isLoading || awaitingPrefs ? (
        <Stack gap="xs" className="px-8 py-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={view === "cards" ? 80 : 36} />)}
        </Stack>
      ) : sorted.length > 0 ? (
        view === "list" ? (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <thead className={table.tableHead}>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 170 }}>Status</th>
                  <th style={{ width: 130 }}>Priority</th>
                  {showAreaColumn && <th style={{ width: 160 }}>Area</th>}
                  <th style={{ width: 72 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  groupBy === "none" ? (
                    group.items.map(renderRow)
                  ) : (
                    <React.Fragment key={group.key}>
                      {renderGroupRow(group.key, group.label, group.items.map((f) => f.id))}
                      {group.items.map(renderRow)}
                    </React.Fragment>
                  )
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Cards view */
          <div className="px-8 py-4">
            {groups.map((group) => (
              groupBy === "none" ? (
                <SimpleGrid key={group.key} cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                  {group.items.map(renderCard)}
                </SimpleGrid>
              ) : (
                <div key={group.key} className="mb-6">
                  <div className="group/row relative mb-2">
                    <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
                      {group.label}
                      <Badge size="xs" variant="light" ml="xs">{group.items.length}</Badge>
                    </Text>
                    {renderGroupHeaderCheckbox(group.items.map((f) => f.id))}
                  </div>
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                    {group.items.map(renderCard)}
                  </SimpleGrid>
                </div>
              )
            ))}
          </div>
        )
      ) : features && features.length > 0 ? (
        <div className={table.empty}>
          <span className="inline-flex items-center gap-3">
            No features match your{" "}
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
          icon={IconBulb}
          message="No features yet. Create one to start tracking what you're building."
          action={
            product && (
              <Button
                onClick={() => setCreateModalOpen(true)}
                leftSection={<IconPlus size={16} />}
                color="brand"
              >
                New feature
              </Button>
            )
          }
        />
        </div>
      )}

      <BulkActionBar count={sel.count} onClear={sel.clear}>
        <BulkActionMenu label="Status">
          {FEATURE_STATUSES.map((s) => (
            <Menu.Item key={s.value} onClick={() => applyBulk({ status: s.value })}>
              <div className="flex items-center gap-2">
                <Badge size="xs" variant="light" color={s.color} />
                {s.label}
              </div>
            </Menu.Item>
          ))}
        </BulkActionMenu>
        <BulkActionMenu label="Priority">
          {([0, 1, 2, 3, 4] as const).map((p) => (
            <Menu.Item key={p} onClick={() => applyBulk({ priority: p })}>
              {PRIORITY_LABELS[p]}
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item onClick={() => applyBulk({ priority: null })}>No priority</Menu.Item>
        </BulkActionMenu>
        <BulkActionMenu label="Area">
          {(areas ?? []).map((a) => (
            <Menu.Item key={a.id} onClick={() => applyBulk({ areaId: a.id })}>
              {a.name}
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item onClick={() => applyBulk({ areaId: null })}>No area</Menu.Item>
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

      <Modal
        opened={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={`Delete ${sel.count} feature${sel.count === 1 ? "" : "s"}?`}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-secondary">
            This permanently deletes the selected feature{sel.count === 1 ? "" : "s"}, including scopes, requirements, and comments. Linked tickets are kept but unlinked. This cannot be undone. If a feature was live, consider Deprecated or Archived instead to keep product history.
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

      {editFeatureId && (
        <EditFeatureModal
          opened={editFeatureId !== null}
          onClose={() => setEditFeatureId(null)}
          featureId={editFeatureId}
          workspaceId={workspaceId ?? undefined}
        />
      )}

      {product && (
        <CreateFeatureModal
          opened={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          productId={product.id}
          productName={product.name}
          workspaceId={workspaceId ?? undefined}
        />
      )}

      {/* Peek drawer - detail over the list, list stays mounted */}
      <PeekDrawer
        label="Feature details"
        opened={!!peekId}
        onClose={() => setPeek(null)}
        fullPageHref={peekId ? `${basePath}/${peekId}` : null}
        onPrev={peekPrev}
        onNext={peekNext}
      >
        {peekId && (
          <FeaturePeek
            featureId={peekId}
            basePath={`/w/${workspace.slug}/products/${productSlug}`}
          />
        )}
      </PeekDrawer>
    </div>
  );
}
