"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Button,
  Select,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconPlus, IconX } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { getTagMantineColor } from "~/utils/tagColors";
import type { TagColor } from "~/types/tag";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

// ---------------------------------------------------------------------------
// Reusable setting row: label+description left, control right
// ---------------------------------------------------------------------------

function SettingRow({
  label,
  description,
  children,
  noBorder,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 py-4 px-5 ${
        noBorder ? "" : "border-b border-border-primary"
      }`}
    >
      <div className="flex-1 min-w-0">
        <Text size="sm" fw={600} className="text-text-primary">
          {label}
        </Text>
        {description && (
          <Text size="xs" className="text-text-muted mt-0.5">
            {description}
          </Text>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary overflow-hidden">
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Title order={4} className="text-text-primary">
      {children}
    </Title>
  );
}

function SectionDescription({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" className="text-text-muted mt-1">
      {children}
    </Text>
  );
}

function SubSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Stage config row
// ---------------------------------------------------------------------------

const TICKET_STATUSES = ["Backlog", "Needs refinement", "Ready to plan", "Committed", "In progress", "QA", "Done", "Deployed", "Archived"];
const EPIC_STATUSES = ["Open", "In progress", "Done", "Cancelled"];
const CYCLE_STATUSES = ["Planned", "Active", "Completed", "Archived"];
const FEATURE_STATUSES = ["Idea", "Defined", "In progress", "Shipped", "Archived"];

function StageRow({
  label,
  description,
  stages,
  noBorder,
}: {
  label: string;
  description: string;
  stages: string[];
  noBorder?: boolean;
}) {
  return (
    <div
      className={`py-4 px-5 ${noBorder ? "" : "border-b border-border-primary"}`}
    >
      <Text size="sm" fw={600} className="text-text-primary">
        {label}
      </Text>
      <Text size="xs" className="text-text-muted mt-0.5">
        {description}
      </Text>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {stages.map((s) => (
          <span
            key={s}
            className="rounded-full border border-border-primary px-2.5 py-0.5 text-xs text-text-secondary"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag management for Labels & Areas
// ---------------------------------------------------------------------------

const COLOR_OPTIONS: { key: TagColor; mantine: string }[] = [
  { key: "avatar-red", mantine: "red" },
  { key: "avatar-teal", mantine: "teal" },
  { key: "avatar-blue", mantine: "blue" },
  { key: "avatar-green", mantine: "green" },
  { key: "avatar-yellow", mantine: "yellow" },
  { key: "avatar-plum", mantine: "grape" },
  { key: "avatar-orange", mantine: "orange" },
  { key: "avatar-lightBlue", mantine: "cyan" },
  { key: "avatar-lavender", mantine: "violet" },
  { key: "avatar-lightPink", mantine: "pink" },
];

interface OptimisticTag {
  id: string;
  name: string;
  color: string;
  category: string | null;
  isSystem: boolean;
  isOptimistic?: boolean;
}

function TagManagementSection({ workspaceId }: { workspaceId: string }) {
  const utils = api.useUtils();
  const { data: tags } = api.tag.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );

  // Optimistic state
  const [optimisticAdds, setOptimisticAdds] = useState<OptimisticTag[]>([]);
  const [optimisticDeletes, setOptimisticDeletes] = useState<Set<string>>(new Set());

  const createTag = api.tag.create.useMutation({
    onSuccess: (created) => {
      void utils.tag.list.invalidate();
      // Remove the optimistic entry that matches this name
      setOptimisticAdds((prev) => prev.filter((t) => t.id !== `optimistic-${created.name}`));
    },
    onError: (_err, variables) => {
      // Remove failed optimistic entry
      setOptimisticAdds((prev) => prev.filter((t) => t.id !== `optimistic-${variables.name}`));
    },
  });

  const deleteTag = api.tag.delete.useMutation({
    onSuccess: () => {
      void utils.tag.list.invalidate();
    },
    onError: (_err, variables) => {
      // Restore on failure
      setOptimisticDeletes((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
    },
  });

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("avatar-blue");
  const [newCategory, setNewCategory] = useState<"label" | "area">("label");

  // Merge server tags with optimistic state
  const serverTags: OptimisticTag[] = (tags?.workspaceTags ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    category: t.category ?? null,
    isSystem: t.isSystem,
  }));

  const allTags = [
    ...serverTags.filter((t) => !optimisticDeletes.has(t.id)),
    ...optimisticAdds,
  ];

  const areas = allTags.filter((t) => t.category === "area");
  const labels = allTags.filter((t) => t.category !== "area");

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed || !workspaceId) return;

    // Add optimistic entry immediately
    const optimisticId = `optimistic-${trimmed}`;
    setOptimisticAdds((prev) => [
      ...prev,
      {
        id: optimisticId,
        name: trimmed,
        color: newColor,
        category: newCategory,
        isSystem: false,
        isOptimistic: true,
      },
    ]);

    createTag.mutate({
      name: trimmed,
      color: newColor,
      category: newCategory,
      workspaceId,
    });

    setNewName("");
  };

  const handleDelete = (id: string) => {
    // If it's an optimistic entry that hasn't been saved yet, just remove it
    if (id.startsWith("optimistic-")) {
      setOptimisticAdds((prev) => prev.filter((t) => t.id !== id));
      return;
    }

    // Optimistic delete - hide immediately
    setOptimisticDeletes((prev) => new Set(prev).add(id));
    deleteTag.mutate({ id });
  };

  return (
    <div className="space-y-6">
      {/* Add new bar */}
      <SectionCard>
        <div className="px-5 py-3">
          <div className="flex items-center gap-2">
            <Select
              value={newCategory}
              onChange={(v) => v && setNewCategory(v as "label" | "area")}
              data={[
                { value: "label", label: "Label" },
                { value: "area", label: "Area" },
              ]}
              size="xs"
              comboboxProps={{ withinPortal: true }}
              styles={{ input: { width: 90 } }}
            />
            <TextInput
              placeholder="Add a label or area..."
              size="xs"
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
              maxLength={50}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              styles={{ root: { flex: 1 }, input: { minHeight: 30, height: 30 } }}
            />
            <div className="flex items-center gap-1">
              {COLOR_OPTIONS.map(({ key, mantine }) => (
                <ActionIcon
                  key={key}
                  size="xs"
                  radius="xl"
                  variant={newColor === key ? "filled" : "light"}
                  color={mantine}
                  onClick={() => setNewColor(key)}
                />
              ))}
            </div>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={handleCreate}
              disabled={!newName.trim()}
            >
              Add
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Two-column grid: Labels left, Areas right */}
      <div className="grid grid-cols-2 gap-4">
        {/* Labels */}
        <div className="space-y-3">
          <SubSectionLabel>Labels</SubSectionLabel>
          <div className="rounded-lg border border-border-primary bg-surface-secondary p-4 min-h-[100px]">
            {labels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {labels.map((tag) => (
                  <Badge
                    key={tag.id}
                    size="md"
                    variant="light"
                    color={getTagMantineColor(tag.color)}
                    className={tag.isOptimistic ? "opacity-60" : ""}
                    rightSection={
                      !tag.isSystem ? (
                        <ActionIcon
                          size={16}
                          radius="xl"
                          variant="transparent"
                          color={getTagMantineColor(tag.color)}
                          onClick={() => handleDelete(tag.id)}
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      ) : undefined
                    }
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <Text size="xs" className="text-text-muted">
                No labels yet
              </Text>
            )}
          </div>
        </div>

        {/* Areas */}
        <div className="space-y-3">
          <SubSectionLabel>Areas</SubSectionLabel>
          <div className="rounded-lg border border-border-primary bg-surface-secondary p-4 min-h-[100px]">
            {areas.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {areas.map((tag) => (
                  <Badge
                    key={tag.id}
                    size="md"
                    variant="light"
                    color={getTagMantineColor(tag.color)}
                    className={tag.isOptimistic ? "opacity-60" : ""}
                    rightSection={
                      !tag.isSystem ? (
                        <ActionIcon
                          size={16}
                          radius="xl"
                          variant="transparent"
                          color={getTagMantineColor(tag.color)}
                          onClick={() => handleDelete(tag.id)}
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      ) : undefined
                    }
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <Text size="xs" className="text-text-muted">
                No areas yet
              </Text>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CYCLE_DURATION_OPTIONS = [
  { value: "1", label: "1 week" },
  { value: "2", label: "2 weeks" },
  { value: "3", label: "3 weeks" },
  { value: "4", label: "4 weeks" },
  { value: "6", label: "6 weeks" },
];

const START_DAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];


export default function ProductSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [funTicketIds, setFunTicketIds] = useState(true);
  const [estimationScale, setEstimationScale] = useState("fibonacci");
  const [enableCycles, setEnableCycles] = useState(true);
  const [autoCreateLookahead, setAutoCreateLookahead] = useState("2");
  const [cycleDuration, setCycleDuration] = useState("2");
  const [cycleStartDay, setCycleStartDay] = useState("1");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description ?? "");
      setFunTicketIds(product.funTicketIds);
      setEstimationScale(product.estimationScale);
    }
  }, [product]);

  const updateProduct = api.product.product.update.useMutation({
    onSuccess: async () => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
        await utils.product.product.getBySlug.invalidate({
          workspaceId,
          slug: productSlug,
        });
      }
    },
    onError: (err) => setError(err.message),
  });

  const deleteProduct = api.product.product.delete.useMutation({
    onSuccess: async () => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products`);
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!product || !workspace) return null;

  const onSave = () => {
    setError(null);
    updateProduct.mutate({
      id: product.id,
      name: name.trim(),
      description: description.trim() || undefined,
      funTicketIds,
      estimationScale: estimationScale as "fibonacci" | "tshirt",
    });
  };

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete product",
      children: (
        <Text size="sm">
          This will permanently delete the product and all of its features,
          tickets, research, and retrospectives. This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteProduct.mutate({ id: product.id }),
    });
  };

  const backPath = `/w/${workspace.slug}/products/${productSlug}`;

  return (
    <div className="max-w-2xl space-y-12">
      {/* Header */}
      <div>
        <Link
          href={backPath}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
        >
          <IconArrowLeft size={16} />
          Back to {product.name}
        </Link>
        <Title order={2} className="text-text-primary">
          Settings
        </Title>
      </div>

      {/* -- General -- */}
      <section className="space-y-4">
        <div>
          <SectionHeading>General</SectionHeading>
          <SectionDescription>Basic product information.</SectionDescription>
        </div>
        <SectionCard>
          <SettingRow label="Name" description="The display name for this product.">
            <TextInput
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              size="xs"
              maxLength={120}
              styles={{ input: { width: 200, textAlign: "right" } }}
            />
          </SettingRow>
          <SettingRow
            label="Fun ticket IDs"
            description="Use memorable word pairs (e.g. swift.falcon) instead of sequential IDs."
          >
            <Switch
              checked={funTicketIds}
              onChange={(e) => setFunTicketIds(e.currentTarget.checked)}
              size="sm"
            />
          </SettingRow>
          <SettingRow
            label="Estimation scale"
            description="How effort is measured on tickets."
          >
            <Select
              value={estimationScale}
              onChange={(v) => v && setEstimationScale(v)}
              data={[
                { value: "fibonacci", label: "Fibonacci (1, 2, 3, 5, 8, 13)" },
                { value: "tshirt", label: "T-shirt (XS, S, M, L, XL)" },
              ]}
              size="xs"
              comboboxProps={{ withinPortal: true }}
              styles={{ input: { width: 220, textAlign: "right" } }}
            />
          </SettingRow>
          <SettingRow
            label="Description"
            description="A short summary shown on the product overview."
            noBorder
          >
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              size="xs"
              autosize
              minRows={1}
              maxRows={3}
              maxLength={2000}
              styles={{ input: { width: 200, textAlign: "right" } }}
            />
          </SettingRow>
        </SectionCard>

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        <div className="flex justify-end">
          <Button
            size="xs"
            color="brand"
            onClick={onSave}
            loading={updateProduct.isPending}
            disabled={!name.trim()}
          >
            Save changes
          </Button>
        </div>
      </section>

      {/* -- Delivery Flow -- */}
      <section className="space-y-6">
        <div>
          <SectionHeading>Delivery Flow</SectionHeading>
          <SectionDescription>Configure how work moves through your product.</SectionDescription>
        </div>

        {/* Cycles */}
        <div className="space-y-3">
          <SubSectionLabel>Cycles</SubSectionLabel>
          <SectionCard>
            <SettingRow
              label="Enable cycles"
              description="Time-boxed iterations to group and track tickets."
            >
              <Switch
                checked={enableCycles}
                onChange={(e) => setEnableCycles(e.currentTarget.checked)}
                size="sm"
              />
            </SettingRow>
            {enableCycles && (
              <>
                <SettingRow
                  label="Auto-create cycles"
                  description="How many upcoming cycles to pre-generate. Set to Off to create cycles manually."
                >
                  <Select
                    value={autoCreateLookahead}
                    onChange={(v) => v && setAutoCreateLookahead(v)}
                    data={[
                      { value: "0", label: "Off" },
                      { value: "1", label: "1 ahead" },
                      { value: "2", label: "2 ahead" },
                      { value: "3", label: "3 ahead" },
                    ]}
                    size="xs"
                    comboboxProps={{ withinPortal: true }}
                    styles={{ input: { width: 120, textAlign: "right" } }}
                  />
                </SettingRow>
                {autoCreateLookahead !== "0" && (
                  <>
                    <SettingRow
                      label="Cadence"
                      description="Default length for each cycle."
                    >
                      <Select
                        value={cycleDuration}
                        onChange={(v) => v && setCycleDuration(v)}
                        data={CYCLE_DURATION_OPTIONS}
                        size="xs"
                        comboboxProps={{ withinPortal: true }}
                        styles={{ input: { width: 120, textAlign: "right" } }}
                      />
                    </SettingRow>
                    <SettingRow
                      label="Start day"
                      description="Which day of the week cycles begin."
                      noBorder
                    >
                      <Select
                        value={cycleStartDay}
                        onChange={(v) => v && setCycleStartDay(v)}
                        data={START_DAY_OPTIONS}
                        size="xs"
                        comboboxProps={{ withinPortal: true }}
                        styles={{ input: { width: 120, textAlign: "right" } }}
                      />
                    </SettingRow>
                  </>
                )}
              </>
            )}
          </SectionCard>
        </div>

        {/* Stages */}
        <div className="space-y-3">
          <SubSectionLabel>Stages</SubSectionLabel>
          <SectionCard>
            <StageRow
              label="Tickets"
              description="Workflow stages for tickets."
              stages={TICKET_STATUSES}
            />
            <StageRow
              label="Epics"
              description="Lifecycle stages for epics."
              stages={EPIC_STATUSES}
            />
            <StageRow
              label="Cycles"
              description="Lifecycle stages for cycles."
              stages={CYCLE_STATUSES}
            />
            <StageRow
              label="Features"
              description="Lifecycle stages for features."
              stages={FEATURE_STATUSES}
              noBorder
            />
          </SectionCard>
        </div>
      </section>

      {/* -- Labels & Areas -- */}
      <section className="space-y-4">
        <div>
          <SectionHeading>Labels & Areas</SectionHeading>
          <SectionDescription>
            Labels are freeform tags for filtering (e.g. tech-debt, urgent). Areas group features by product area (e.g. Platform, Growth).
          </SectionDescription>
        </div>

        <TagManagementSection workspaceId={workspaceId ?? ""} />
      </section>

      {/* -- Danger Zone -- */}
      <section className="space-y-4">
        <div>
          <SectionHeading>Danger zone</SectionHeading>
          <SectionDescription>Irreversible and destructive actions.</SectionDescription>
        </div>
        <div className="rounded-lg border border-red-500/40 bg-surface-secondary overflow-hidden">
          <SettingRow
            label="Delete this product"
            description="Permanently removes all features, tickets, research, and retrospectives."
            noBorder
          >
            <Button
              color="red"
              variant="outline"
              size="xs"
              onClick={onDelete}
              loading={deleteProduct.isPending}
            >
              Delete
            </Button>
          </SettingRow>
        </div>
      </section>

      <div className="h-8" />
    </div>
  );
}
