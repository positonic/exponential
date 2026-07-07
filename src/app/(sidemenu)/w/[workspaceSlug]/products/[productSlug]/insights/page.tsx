"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Popover,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconBulb,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFilter,
  IconLayoutKanban,
  IconList,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconTarget,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { KanbanBoard } from "~/app/_components/shared/kanban";
import type { KanbanItem } from "~/app/_components/shared/kanban";
import { InsightCard } from "~/app/_components/product/InsightCard";
import { CreateInsightModal } from "~/app/_components/product/CreateInsightModal";
import {
  INSIGHT_TYPES,
  INSIGHT_STATUS_COLUMNS,
  TYPE_MAP,
  STATUS_OPTIONS,
  STATUS_COLORS,
  type InsightStatus,
} from "~/app/_components/product/insightMeta";

// Provenance filter (ADR-0037). `form` = arrived via a form (source starts with
// `form:`), `manual` = everything else, `all` = both.
type InsightOrigin = "all" | "form" | "manual";

/**
 * Render an insight's `source` readably. A form-stamped source is
 * `form:<slug>`; show it as "Form: <slug>" rather than the raw prefix. Anything
 * else is shown verbatim.
 */
function formatSource(source: string): string {
  if (source.startsWith("form:")) {
    const slug = source.slice("form:".length);
    return slug ? `Form: ${slug}` : "Form";
  }
  return source;
}

// ---------------------------------------------------------------------------
// Inline status badge - click to change status in place (backlog StatusCell
// pattern), replacing the old "Mark as ..." burrow in the row overflow menu.
// ---------------------------------------------------------------------------

function InsightStatusBadge({
  status,
  onUpdate,
}: {
  status: string;
  onUpdate: (s: InsightStatus) => void;
}) {
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <Badge
          size="xs"
          variant="light"
          color={STATUS_COLORS[status] ?? "gray"}
          className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
        >
          {STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status}
        </Badge>
      </Menu.Target>
      <Menu.Dropdown>
        {STATUS_OPTIONS.map((s) => (
          <Menu.Item key={s.value} onClick={() => onUpdate(s.value)}>
            <div className="flex items-center gap-2">
              <Badge size="xs" variant="light" color={STATUS_COLORS[s.value] ?? "gray"}>
                {s.label}
              </Badge>
            </div>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

// ---------------------------------------------------------------------------
// Inline features editor - compact icon + count trigger, popover multiselect
// ---------------------------------------------------------------------------

function InsightFeaturesEditor({
  insightId,
  productId,
  currentFeatures,
}: {
  insightId: string;
  productId: string;
  currentFeatures: Array<{ feature: { id: string; name: string } }>;
}) {
  const utils = api.useUtils();
  const [opened, setOpened] = useState(false);
  const [selected, setSelected] = useState<string[]>(
    currentFeatures.map((f) => f.feature.id),
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId },
    { enabled: opened },
  );

  const setFeatures = api.product.insight.setFeatures.useMutation({
    onSuccess: async () => {
      await utils.product.insight.list.invalidate({ productId });
    },
  });

  const count = currentFeatures.length;
  const label =
    count > 0
      ? currentFeatures.map((f) => f.feature.name).join(", ")
      : "Link features";

  return (
    <Popover
      position="bottom-end"
      withinPortal
      shadow="md"
      opened={opened}
      onChange={(next) => {
        setOpened(next);
        if (next) setSelected(currentFeatures.map((f) => f.feature.id));
      }}
    >
      <Popover.Target>
        <Tooltip label={label} position="top">
          <UnstyledButton
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setOpened((o) => !o);
            }}
            className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
          >
            <IconTarget size={12} />
            <Text size="xs">{count > 0 ? count : ""}</Text>
          </UnstyledButton>
        </Tooltip>
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
        <MultiSelect
          autoFocus
          value={selected}
          onChange={(next) => {
            setSelected(next);
            setFeatures.mutate({ insightId, featureIds: next });
          }}
          data={(features ?? []).map((f) => ({ value: f.id, label: f.name }))}
          searchable
          clearable
          size="xs"
          placeholder="Search features..."
          comboboxProps={{ withinPortal: true }}
          nothingFoundMessage="No features yet"
        />
      </Popover.Dropdown>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Active filter chip - shows a set filter in the action bar, removable
// ---------------------------------------------------------------------------

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
    >
      {label}
      <IconX size={11} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// Status groups render in triage order; Dismissed starts collapsed (the
// backlog's "Completed" treatment).
const GROUP_ORDER: InsightStatus[] = ["INBOX", "TRIAGED", "LINKED", "DISMISSED"];

export default function InsightsPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [modalOpened, setModalOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const [origin, setOrigin] = useState<InsightOrigin>("all");
  const [showParked, setShowParked] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["DISMISSED"]));
  const [parkTarget, setParkTarget] = useState<{ id: string; title: string } | null>(null);
  const [parkReason, setParkReason] = useState("");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // View preference persists per user via the plugin-config prefs map. The
  // map is keyed by an opaque string; suffixing the slug keeps insights prefs
  // separate from the tickets page's prefs for the same product.
  const prefsKey = `${productSlug}/insights`;
  const { data: savedPrefs } = api.product.product.getViewPrefs.useQuery(
    { productSlug: prefsKey, workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const savePrefs = api.product.product.saveViewPrefs.useMutation();

  useEffect(() => {
    if (savedPrefs && !prefsLoaded) {
      if (savedPrefs.view === "list" || savedPrefs.view === "board") {
        setView(savedPrefs.view);
      }
      setPrefsLoaded(true);
    }
  }, [savedPrefs, prefsLoaded]);

  const changeView = (v: "list" | "board") => {
    setView(v);
    if (workspaceId) {
      savePrefs.mutate({ productSlug: prefsKey, workspaceId, prefs: { view: v } });
    }
  };

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: insights, isLoading } = api.product.insight.list.useQuery(
    { productId: product?.id ?? "", includeParked: showParked, origin },
    { enabled: !!product?.id },
  );

  const utils = api.useUtils();
  const invalidate = () => {
    if (product?.id) void utils.product.insight.list.invalidate({ productId: product.id });
  };

  const updateInsight = api.product.insight.update.useMutation({ onSuccess: invalidate });
  const deleteInsight = api.product.insight.delete.useMutation({ onSuccess: invalidate });
  const parkInsight = api.product.insight.park.useMutation({ onSuccess: invalidate });
  const unparkInsight = api.product.insight.unpark.useMutation({ onSuccess: invalidate });

  const moveInsight = (itemId: string, toColumnId: string) =>
    updateInsight.mutateAsync({ id: itemId, status: toColumnId as InsightStatus });

  const filtered = useMemo(() => {
    if (!insights) return [];
    let list = [...insights];
    if (typeFilter) list = list.filter((i) => i.type === typeFilter);
    if (statusFilter) list = list.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.body ?? "").toLowerCase().includes(q) ||
          (i.source ?? "").toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [insights, typeFilter, statusFilter, search]);

  const boardItems = useMemo<(NonNullable<typeof insights>[number] & KanbanItem)[]>(
    () => filtered.map((i) => ({ ...i, columnId: i.status })),
    [filtered],
  );

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((status) => ({
        status,
        label: STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status,
        items: filtered.filter((i) => i.status === status),
      })).filter((g) => g.items.length > 0),
    [filtered],
  );

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeFilterCount =
    (typeFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (origin !== "all" ? 1 : 0) +
    (showParked ? 1 : 0);

  const handleDelete = (id: string, title: string) => {
    modals.openConfirmModal({
      title: "Delete insight",
      children: <Text size="sm">Delete &quot;{title}&quot;? This cannot be undone.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteInsight.mutate({ id }),
    });
  };

  const openParkModal = (id: string, title: string) => {
    setParkReason("");
    setParkTarget({ id, title });
  };

  const confirmPark = () => {
    const reason = parkReason.trim();
    if (!parkTarget || !reason) return;
    parkInsight.mutate({ id: parkTarget.id, reason });
    setParkTarget(null);
  };

  if (!workspace) return null;

  // Single-line row (backlog list pattern): icon, status, title, then compact
  // meta on the right. Body preview intentionally dropped from the list.
  const renderRow = (insight: (typeof filtered)[number], isLast: boolean) => {
    const typeDef = TYPE_MAP[insight.type];
    const Icon = typeDef?.icon ?? IconBulb;
    const isParked = insight.parkedAt != null;
    return (
      <div
        key={insight.id}
        className={`flex items-center gap-3 px-3 py-2 hover:bg-surface-hover transition-colors ${
          isLast ? "" : "border-b border-border-primary"
        }`}
      >
        <Tooltip label={typeDef?.label ?? insight.type} position="top">
          <div className="shrink-0 flex items-center">
            <Icon size={15} className={`text-${typeDef?.color ?? "gray"}-400`} />
          </div>
        </Tooltip>
        <InsightStatusBadge
          status={insight.status}
          onUpdate={(s) => updateInsight.mutate({ id: insight.id, status: s })}
        />
        <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
          {insight.title}
        </Text>
        {isParked && (
          <Tooltip label={insight.parkReason ?? "Parked"} position="top">
            <Badge size="xs" variant="light" color="orange" className="shrink-0">
              parked
            </Badge>
          </Tooltip>
        )}
        {(insight.impact != null || insight.confidence != null) && (
          <Tooltip
            label={`Impact ${insight.impact ?? "-"} / Confidence ${insight.confidence ?? "-"}`}
            position="top"
          >
            <Text size="xs" className="text-text-muted font-mono shrink-0">
              {insight.impact != null ? `I${insight.impact}` : ""}
              {insight.impact != null && insight.confidence != null ? "·" : ""}
              {insight.confidence != null ? `C${insight.confidence}` : ""}
            </Text>
          </Tooltip>
        )}
        {insight.category && (
          <Badge size="xs" variant="outline" color="gray" className="shrink-0">
            {insight.category}
          </Badge>
        )}
        {insight.source && (
          <Text size="xs" className="text-text-muted shrink-0 max-w-[160px]" lineClamp={1}>
            {formatSource(insight.source)}
          </Text>
        )}
        {product && (
          <InsightFeaturesEditor
            insightId={insight.id}
            productId={product.id}
            currentFeatures={insight.features}
          />
        )}
        <Avatar size="xs" radius="xl" src={insight.createdBy?.image} className="shrink-0">
          {(insight.createdBy?.name ?? "?")[0]?.toUpperCase()}
        </Avatar>
        <Text size="xs" className="text-text-muted shrink-0 w-16 text-right">
          {new Date(insight.createdAt).toLocaleDateString()}
        </Text>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" size="xs" className="text-text-muted shrink-0">
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {isParked ? (
              <Menu.Item
                leftSection={<IconPlayerPlay size={14} />}
                onClick={() => unparkInsight.mutate({ id: insight.id })}
              >
                Unpark
              </Menu.Item>
            ) : (
              <Menu.Item
                leftSection={<IconPlayerPause size={14} />}
                onClick={() => openParkModal(insight.id, insight.title)}
              >
                Park
              </Menu.Item>
            )}
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => handleDelete(insight.id, insight.title)}
            >
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    );
  };

  return (
    <Stack gap="sm">
      {/* Action bar - view toggle + active filter chips | search, filters, new */}
      <div className="flex items-center gap-2">
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => changeView(v as "list" | "board")}
          data={[
            { value: "list", label: <IconList size={14} /> },
            { value: "board", label: <IconLayoutKanban size={14} /> },
          ]}
          styles={{
            root: {
              backgroundColor: "var(--color-surface-secondary)",
              border: "1px solid var(--color-border-primary)",
            },
          }}
        />

        {/* Active filters stay visible as removable chips */}
        {typeFilter && (
          <FilterChip
            label={TYPE_MAP[typeFilter]?.label ?? typeFilter}
            onClear={() => setTypeFilter(null)}
          />
        )}
        {statusFilter && (
          <FilterChip
            label={STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label ?? statusFilter}
            onClear={() => setStatusFilter(null)}
          />
        )}
        {origin !== "all" && (
          <FilterChip
            label={origin === "form" ? "Form" : "Manual"}
            onClear={() => setOrigin("all")}
          />
        )}
        {showParked && <FilterChip label="Parked" onClear={() => setShowParked(false)} />}

        <div className="flex-1" />

        <TextInput
          placeholder="Search..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<IconSearch size={14} />}
          styles={{
            root: { width: 200 },
            input: {
              backgroundColor: "transparent",
              border: "1px solid var(--color-border-primary)",
              fontSize: "0.8rem",
              height: 30,
              minHeight: 30,
            },
          }}
        />

        <Popover position="bottom-end" withinPortal shadow="md">
          <Popover.Target>
            <Tooltip label="Filter" position="bottom">
              <ActionIcon
                variant="subtle"
                size="sm"
                className="text-text-muted hover:text-text-primary border border-border-primary rounded-md"
                style={{ height: 30, width: 30 }}
              >
                <div className="relative flex items-center justify-center">
                  <IconFilter size={15} />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-brand-primary" />
                  )}
                </div>
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown
            styles={{
              dropdown: {
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-primary)",
                minWidth: 260,
                maxWidth: 280,
              },
            }}
          >
            <Stack gap="sm">
              <div>
                <Text size="xs" className="text-text-muted mb-1.5">
                  Type
                </Text>
                <div className="flex flex-wrap gap-1">
                  {INSIGHT_TYPES.map((t) => {
                    const on = typeFilter === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setTypeFilter(on ? null : t.value)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                          on
                            ? "bg-surface-hover text-text-primary"
                            : "bg-transparent text-text-muted/60 hover:text-text-muted"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Text size="xs" className="text-text-muted whitespace-nowrap">
                  Status
                </Text>
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  data={STATUS_OPTIONS}
                  placeholder="Any"
                  size="xs"
                  clearable
                  variant="filled"
                  comboboxProps={{ withinPortal: true }}
                  styles={{
                    root: { flex: 1 },
                    input: { fontSize: "0.8rem", height: 28, minHeight: 28 },
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Text size="xs" className="text-text-muted whitespace-nowrap">
                  Origin
                </Text>
                <SegmentedControl
                  size="xs"
                  value={origin}
                  onChange={(v) => setOrigin(v as InsightOrigin)}
                  data={[
                    { value: "all", label: "All" },
                    { value: "form", label: "Form" },
                    { value: "manual", label: "Manual" },
                  ]}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Text size="xs" className="text-text-muted whitespace-nowrap">
                  Show parked
                </Text>
                <Switch
                  size="xs"
                  checked={showParked}
                  onChange={(e) => setShowParked(e.currentTarget.checked)}
                />
              </div>
            </Stack>
          </Popover.Dropdown>
        </Popover>

        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => setModalOpened(true)}
          disabled={!product}
          variant="light"
          styles={{ root: { height: 30 } }}
        >
          New insight
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <Stack gap="xs">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={36} />
          ))}
        </Stack>
      ) : filtered.length === 0 ? (
        insights && insights.length > 0 ? (
          <Text size="sm" className="text-text-muted py-8 text-center">
            No insights match your filters.
          </Text>
        ) : (
          <EmptyState
            icon={IconBulb}
            message="No insights yet. Capture problems, pain points, feedback, personas, journeys, and competitive observations."
            action={
              <Button
                onClick={() => setModalOpened(true)}
                leftSection={<IconPlus size={16} />}
                color="brand"
                disabled={!product}
              >
                New insight
              </Button>
            }
          />
        )
      ) : view === "board" ? (
        <KanbanBoard
          columns={INSIGHT_STATUS_COLUMNS}
          items={boardItems}
          onMove={moveInsight}
          getItemLabel={(item) => item.title}
          renderCard={(item, { isOverlay }) => (
            <InsightCard insight={item} isDragOverlay={isOverlay} />
          )}
        />
      ) : (
        <div className="border border-border-primary rounded-lg overflow-hidden">
          {groups.map((group) => (
            <React.Fragment key={group.status}>
              <div
                className="bg-surface-secondary/50 px-3 pt-4 pb-2 border-b border-border-primary cursor-pointer select-none flex items-center gap-1.5"
                onClick={() => toggleCollapsed(group.status)}
              >
                {collapsed.has(group.status) ? (
                  <IconChevronRight size={14} className="text-text-muted" />
                ) : (
                  <IconChevronDown size={14} className="text-text-muted" />
                )}
                <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wide">
                  {group.label}
                </Text>
                <Badge size="xs" variant="light">
                  {group.items.length}
                </Badge>
              </div>
              {!collapsed.has(group.status) &&
                group.items.map((insight, i) =>
                  renderRow(insight, i === group.items.length - 1),
                )}
            </React.Fragment>
          ))}
        </div>
      )}

      {product && (
        <CreateInsightModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          productId={product.id}
          productName={product.name}
        />
      )}

      {/* Park modal - collects a meaningful reason (parking = defer WITH a reason). */}
      <Modal
        opened={!!parkTarget}
        onClose={() => setParkTarget(null)}
        title="Park insight"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-muted">
            Parking defers &quot;{parkTarget?.title}&quot; with a reason; it keeps its status and can be
            revived later.
          </Text>
          <Textarea
            label="Reason"
            placeholder="Why park this? e.g. out of scope, duplicate, insufficient evidence"
            value={parkReason}
            onChange={(e) => setParkReason(e.currentTarget.value)}
            data-autofocus
            autosize
            minRows={2}
            maxRows={5}
            required
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setParkTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmPark} disabled={!parkReason.trim()} loading={parkInsight.isPending}>
              Park
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
