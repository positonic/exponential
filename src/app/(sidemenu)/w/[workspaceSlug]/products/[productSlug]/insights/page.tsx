"use client";

import { useMemo, useState } from "react";
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
  UnstyledButton,
} from "@mantine/core";
import {
  IconBulb,
  IconDots,
  IconLayoutKanban,
  IconList,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconTarget,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { KanbanBoard } from "~/app/_components/shared/kanban";
import type { KanbanItem } from "~/app/_components/shared/kanban";
import { InsightCard } from "~/app/_components/product/InsightCard";
import {
  INSIGHT_TYPES,
  INSIGHT_STATUS_COLUMNS,
  TYPE_MAP,
  STATUS_OPTIONS,
  STATUS_COLORS,
  SENTIMENT_COLORS,
  type InsightType,
  type InsightStatus,
} from "~/app/_components/product/insightMeta";

const SCORE_OPTIONS = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

function CreateInsightModal({
  opened,
  onClose,
  productId,
}: {
  opened: boolean;
  onClose: () => void;
  productId: string;
}) {
  const utils = api.useUtils();
  const [type, setType] = useState<InsightType>("PAIN_POINT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [sentiment, setSentiment] = useState<string | null>(null);
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [evidence, setEvidence] = useState("");
  const [impact, setImpact] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);

  const { data: features } = api.product.feature.list.useQuery(
    { productId },
    { enabled: !!productId && opened },
  );

  const reset = () => {
    setTitle("");
    setBody("");
    setSource("");
    setSentiment(null);
    setFeatureIds([]);
    setCategory("");
    setEvidence("");
    setImpact(null);
    setConfidence(null);
  };

  const create = api.product.insight.create.useMutation({
    onSuccess: async () => {
      await utils.product.insight.list.invalidate({ productId });
      onClose();
      reset();
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="New insight" size="lg">
      <Stack gap="md">
        <Select
          label="Type"
          value={type}
          onChange={(v) => v && setType(v as InsightType)}
          data={INSIGHT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          size="sm"
        />
        <TextInput
          label="Title"
          placeholder="What did you learn?"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          size="sm"
          required
        />
        <Textarea
          label="Details"
          placeholder="Describe the insight, evidence, or context..."
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          autosize
          minRows={3}
          maxRows={8}
          size="sm"
        />
        <TextInput
          label="Source"
          placeholder="e.g. User interview, Zendesk #4231, G2 review"
          value={source}
          onChange={(e) => setSource(e.currentTarget.value)}
          size="sm"
        />
        {type === "FEEDBACK" && (
          <Select
            label="Sentiment"
            value={sentiment}
            onChange={setSentiment}
            data={[
              { value: "positive", label: "Positive" },
              { value: "neutral", label: "Neutral" },
              { value: "negative", label: "Negative" },
            ]}
            size="sm"
            clearable
          />
        )}

        {/* General triage fields — usable by any type (ADR-0036) */}
        <Group grow>
          <Select
            label="Impact"
            placeholder="1–5"
            value={impact}
            onChange={setImpact}
            data={SCORE_OPTIONS}
            size="sm"
            clearable
          />
          <Select
            label="Confidence"
            placeholder="1–5"
            value={confidence}
            onChange={setConfidence}
            data={SCORE_OPTIONS}
            size="sm"
            clearable
          />
        </Group>
        <TextInput
          label="Category"
          placeholder="e.g. Onboarding, Billing"
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value)}
          size="sm"
        />
        <Textarea
          label="Evidence"
          placeholder="Links, quotes, or data backing this up..."
          value={evidence}
          onChange={(e) => setEvidence(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={6}
          size="sm"
        />

        <MultiSelect
          label="Features"
          placeholder="Link to one or more features..."
          value={featureIds}
          onChange={setFeatureIds}
          data={(features ?? []).map((f) => ({ value: f.id, label: f.name }))}
          searchable
          clearable
          size="sm"
          comboboxProps={{ withinPortal: true }}
          nothingFoundMessage="No features yet"
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate({
              productId,
              type,
              title: title.trim(),
              body: body.trim() || undefined,
              source: source.trim() || undefined,
              sentiment: (sentiment ?? undefined) as "positive" | "neutral" | "negative" | undefined,
              category: category.trim() || undefined,
              evidence: evidence.trim() || undefined,
              impact: impact ? Number(impact) : undefined,
              confidence: confidence ? Number(confidence) : undefined,
              featureIds: featureIds.length > 0 ? featureIds : undefined,
            })}
            loading={create.isPending}
            disabled={!title.trim()}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Inline features editor
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

  const hasFeatures = currentFeatures.length > 0;

  return (
    <Popover
      position="bottom-start"
      withinPortal
      shadow="md"
      opened={opened}
      onChange={(next) => {
        setOpened(next);
        if (next) setSelected(currentFeatures.map((f) => f.feature.id));
      }}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors"
        >
          <IconTarget size={10} />
          {hasFeatures ? (
            <Text size="xs">
              {currentFeatures.map((f) => f.feature.name).join(", ")}
            </Text>
          ) : (
            <Text size="xs">Add feature</Text>
          )}
        </UnstyledButton>
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
// Page
// ---------------------------------------------------------------------------

export default function ResearchPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [modalOpened, setModalOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const [showParked, setShowParked] = useState(false);

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: insights, isLoading } = api.product.insight.list.useQuery(
    { productId: product?.id ?? "", includeParked: showParked },
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

  const handleDelete = (id: string, title: string) => {
    modals.openConfirmModal({
      title: "Delete insight",
      children: <Text size="sm">Delete &quot;{title}&quot;? This cannot be undone.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteInsight.mutate({ id }),
    });
  };

  const handlePark = (id: string) => {
    modals.openConfirmModal({
      title: "Park insight",
      children: (
        <Text size="sm">
          Parking defers this insight with a reason; it keeps its status and can be revived later.
        </Text>
      ),
      labels: { confirm: "Park", cancel: "Cancel" },
      // Reason is required by the API; a simple default keeps this one-click.
      onConfirm: () => parkInsight.mutate({ id, reason: "Parked" }),
    });
  };

  if (!workspace) return null;

  return (
    <Stack gap="sm">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Type filter pills */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTypeFilter(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              typeFilter === null
                ? "bg-surface-hover text-text-primary"
                : "bg-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            All
          </button>
          {INSIGHT_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTypeFilter(typeFilter === t.value ? null : t.value)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  typeFilter === t.value
                    ? "bg-surface-hover text-text-primary"
                    : "bg-transparent text-text-muted hover:text-text-secondary"
                }`}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <Switch
          size="xs"
          label="Parked"
          checked={showParked}
          onChange={(e) => setShowParked(e.currentTarget.checked)}
          styles={{ label: { fontSize: "0.8rem", color: "var(--color-text-muted)" } }}
        />

        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as "list" | "board")}
          data={[
            { value: "list", label: <IconList size={14} /> },
            { value: "board", label: <IconLayoutKanban size={14} /> },
          ]}
        />

        <TextInput
          placeholder="Search..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<IconSearch size={14} />}
          styles={{
            root: { width: 200 },
            input: { backgroundColor: "transparent", border: "1px solid var(--color-border-primary)", fontSize: "0.8rem", height: 30, minHeight: 30 },
          }}
        />

        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          data={STATUS_OPTIONS}
          placeholder="Status"
          size="xs"
          clearable
          comboboxProps={{ withinPortal: true }}
          styles={{
            root: { width: 120 },
            input: { height: 30, minHeight: 30, fontSize: "0.8rem" },
          }}
        />

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
        <Stack gap="sm">
          {[1, 2, 3].map((i) => <Skeleton key={i} height={80} />)}
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
          {filtered.map((insight, i) => {
            const typeDef = TYPE_MAP[insight.type];
            const Icon = typeDef?.icon ?? IconBulb;
            const isParked = insight.parkedAt != null;
            return (
              <div
                key={insight.id}
                className={`px-4 py-3 hover:bg-surface-hover transition-colors ${
                  i < filtered.length - 1 ? "border-b border-border-primary" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div className="mt-0.5 shrink-0">
                    <Icon size={16} className={`text-${typeDef?.color ?? "gray"}-400`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Text size="sm" fw={500} className="text-text-primary">
                        {insight.title}
                      </Text>
                      <Badge size="xs" variant="light" color={typeDef?.color ?? "gray"}>
                        {typeDef?.label ?? insight.type}
                      </Badge>
                      <Badge size="xs" variant="light" color={STATUS_COLORS[insight.status] ?? "gray"}>
                        {insight.status.toLowerCase()}
                      </Badge>
                      {insight.category && (
                        <Badge size="xs" variant="outline" color="gray">
                          {insight.category}
                        </Badge>
                      )}
                      {insight.sentiment && (
                        <Badge size="xs" variant="dot" color={SENTIMENT_COLORS[insight.sentiment] ?? "gray"}>
                          {insight.sentiment}
                        </Badge>
                      )}
                      {isParked && (
                        <Badge size="xs" variant="light" color="orange">
                          parked
                        </Badge>
                      )}
                    </div>

                    {insight.body && (
                      <Text size="xs" className="text-text-muted line-clamp-2 mb-1">
                        {insight.body}
                      </Text>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      {(insight.impact != null || insight.confidence != null) && (
                        <Text size="xs" className="text-text-muted">
                          {insight.impact != null ? `Impact ${insight.impact}` : ""}
                          {insight.impact != null && insight.confidence != null ? " · " : ""}
                          {insight.confidence != null ? `Confidence ${insight.confidence}` : ""}
                        </Text>
                      )}
                      {insight.source && (
                        <Text size="xs" className="text-text-muted">
                          {insight.source}
                        </Text>
                      )}
                      {product && (
                        <InsightFeaturesEditor
                          insightId={insight.id}
                          productId={product.id}
                          currentFeatures={insight.features}
                        />
                      )}
                      <Text size="xs" className="text-text-muted">
                        {new Date(insight.createdAt).toLocaleDateString()}
                      </Text>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Avatar size="xs" radius="xl" src={insight.createdBy?.image}>
                      {(insight.createdBy?.name ?? "?")[0]?.toUpperCase()}
                    </Avatar>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" size="xs" className="text-text-muted">
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {STATUS_OPTIONS.filter((s) => s.value !== insight.status).map((s) => (
                          <Menu.Item
                            key={s.value}
                            onClick={() => updateInsight.mutate({ id: insight.id, status: s.value })}
                          >
                            Mark as {s.label.toLowerCase()}
                          </Menu.Item>
                        ))}
                        <Menu.Divider />
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
                            onClick={() => handlePark(insight.id)}
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {product && (
        <CreateInsightModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          productId={product.id}
        />
      )}
    </Stack>
  );
}
