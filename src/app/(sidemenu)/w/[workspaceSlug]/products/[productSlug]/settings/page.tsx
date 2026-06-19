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
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconLayoutList,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconShieldExclamation,
  IconTags,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { getTagMantineColor } from "~/utils/tagColors";
import type { TagColor } from "~/types/tag";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { FavoriteButton } from "~/app/_components/shared/FavoriteButton";
import { buildProductFavoriteTarget } from "../favoriteTarget";
import {
  SettingsShell,
  SettingsHero,
  SettingsLayout,
  SettingsSidebar,
  SettingsSection,
  SettingsField,
  SettingsDangerRow,
  SettingsDangerZone,
  type SidebarGroup,
} from "~/app/_components/settings/SettingsShell";

type SectionId = "general" | "flow" | "labels" | "workspace" | "danger";

// ---------------------------------------------------------------------------
// Small helpers used inside the design-system sections
// ---------------------------------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary overflow-hidden">
      {children}
    </div>
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

const TICKET_STATUSES = ["Backlog", "Needs refinement", "Ready to plan", "Committed", "In progress", "Blocked", "QA", "Done", "Deployed", "Archived"];
const EPIC_STATUSES = ["Open", "In progress", "Done", "Cancelled"];
const CYCLE_STATUSES = ["Planned", "Active", "Completed", "Archived"];
const FEATURE_STATUSES = ["Idea", "Defined", "In progress", "Shipped", "Archived"];

function StageRow({
  label,
  description,
  stages,
}: {
  label: string;
  description: string;
  stages: string[];
}) {
  return (
    <div className="border-t border-border-primary py-3.5 first:border-t-0 first:pt-0.5">
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

  const [section, setSection] = useState<SectionId>("general");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [funTicketIds, setFunTicketIds] = useState(true);
  const [enableCycles, setEnableCycles] = useState(true);
  const [autoCreateLookahead, setAutoCreateLookahead] = useState("2");
  const [cycleDuration, setCycleDuration] = useState("2");
  const [cycleStartDay, setCycleStartDay] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string | null>(
    null,
  );
  const [moveError, setMoveError] = useState<string | null>(null);

  const { data: workspaces } = api.workspace.list.useQuery();

  useEffect(() => {
    if (product) {
      setName(product.name);
      setSlug(product.slug);
      setDescription(product.description ?? "");
      setFunTicketIds(product.funTicketIds);
    }
  }, [product]);

  const updateProduct = api.product.product.update.useMutation({
    onSuccess: async (updated) => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
        await utils.product.product.getBySlug.invalidate({
          workspaceId,
          slug: productSlug,
        });
      }
      // The page is keyed by slug — follow it to the new URL if it changed.
      if (workspace && updated.slug !== productSlug) {
        router.replace(
          `/w/${workspace.slug}/products/${updated.slug}/settings`,
        );
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

  const moveProduct = api.product.product.moveToWorkspace.useMutation({
    onSuccess: async (result) => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
      }
      if (targetWorkspaceId) {
        await utils.product.product.list.invalidate({
          workspaceId: targetWorkspaceId,
        });
      }
      router.push(`/w/${result.workspaceSlug}/products/${result.slug}`);
    },
    onError: (err) => setMoveError(err.message),
  });

  if (!product || !workspace) return null;

  const trimmedSlug = slug.trim();
  const slugValid = /^[a-z0-9-]+$/.test(trimmedSlug);

  const onSave = () => {
    setError(null);
    updateProduct.mutate({
      id: product.id,
      name: name.trim(),
      slug: trimmedSlug,
      description: description.trim() || undefined,
      funTicketIds,
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

  const moveTargets = (workspaces ?? []).filter(
    (w) =>
      w.id !== workspaceId &&
      w.currentUserRole !== null &&
      w.currentUserRole !== "guest",
  );

  const onMove = () => {
    if (!targetWorkspaceId) return;
    const target = moveTargets.find((w) => w.id === targetWorkspaceId);
    setMoveError(null);
    modals.openConfirmModal({
      title: "Move product",
      children: (
        <Text size="sm">
          Move <strong>{product.name}</strong> to{" "}
          <strong>{target?.name ?? "another workspace"}</strong>? All of its
          tickets, features, research, and insights move with it.
        </Text>
      ),
      labels: { confirm: "Move", cancel: "Cancel" },
      onConfirm: () =>
        moveProduct.mutate({ id: product.id, targetWorkspaceId }),
    });
  };

  const groups: SidebarGroup<SectionId>[] = [
    {
      title: "Product",
      items: [
        { id: "general", label: "General", icon: IconSettings },
        { id: "flow", label: "Delivery Flow", icon: IconRefresh },
        { id: "labels", label: "Labels & Areas", icon: IconTags },
      ],
    },
    {
      items: [
        { id: "workspace", label: "Workspace", icon: IconArrowsExchange },
        { id: "danger", label: "Danger zone", icon: IconTrash },
      ],
    },
  ];

  return (
    <SettingsShell>
      <div className="px-6 md:px-10 pt-6 flex items-center justify-between">
        <Link
          href={backPath}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <IconArrowLeft size={16} />
          Back to {product.name}
        </Link>
        {workspaceId && (
          <FavoriteButton
            entityType="page"
            {...buildProductFavoriteTarget({
              pathname: `${backPath}/settings`,
              workspaceSlug: workspace.slug,
              productSlug,
              productName: product.name,
            })}
            workspaceId={workspaceId}
          />
        )}
      </div>

      <SettingsHero
        eyebrow={`Product · ${product.name}`}
        icon={IconSettings}
        title="Settings"
        description="Configure this product's general information, delivery flow, labels, and workspace."
      />

      <SettingsLayout
        sidebar={
          <SettingsSidebar<SectionId>
            groups={groups}
            activeId={section}
            onSelect={setSection}
          />
        }
      >
        {section === "general" && (
          <SettingsSection
            icon={IconSettings}
            title="General"
            description="Basic product information."
          >
            <SettingsField
              label="Name"
              sublabel="The display name for this product."
            >
              <TextInput
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                size="xs"
                maxLength={120}
                className="max-w-xs"
              />
            </SettingsField>

            <SettingsField
              label="Slug"
              sublabel="Used in this product's URL. Lowercase letters, numbers, and hyphens only. Existing links using the old slug will stop working."
            >
              <TextInput
                value={slug}
                onChange={(e) =>
                  setSlug(e.currentTarget.value.toLowerCase())
                }
                size="xs"
                maxLength={60}
                className="max-w-xs"
                error={
                  trimmedSlug && !slugValid
                    ? "Lowercase letters, numbers, and hyphens only"
                    : undefined
                }
              />
            </SettingsField>

            <SettingsField
              label="Fun ticket IDs"
              sublabel="Use memorable word pairs (e.g. swift.falcon) instead of sequential IDs."
            >
              <Switch
                checked={funTicketIds}
                onChange={(e) => setFunTicketIds(e.currentTarget.checked)}
                size="sm"
              />
            </SettingsField>

            <SettingsField
              label="Description"
              sublabel="A short summary shown on the product overview."
            >
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                size="xs"
                autosize
                minRows={1}
                maxRows={3}
                maxLength={2000}
                className="max-w-md"
              />
            </SettingsField>

            {error && (
              <Text size="sm" c="red" className="mt-3">
                {error}
              </Text>
            )}

            <div className="mt-4 flex justify-end">
              <Button
                size="xs"
                color="brand"
                onClick={onSave}
                loading={updateProduct.isPending}
                disabled={!name.trim() || !slugValid}
              >
                Save changes
              </Button>
            </div>
          </SettingsSection>
        )}

        {section === "flow" && (
          <>
            <SettingsSection
              icon={IconRefresh}
              title="Cycles"
              description="Time-boxed iterations to group and track tickets."
            >
              <SettingsField
                label="Enable cycles"
                sublabel="Group and track tickets in time-boxed iterations."
              >
                <Switch
                  checked={enableCycles}
                  onChange={(e) => setEnableCycles(e.currentTarget.checked)}
                  size="sm"
                />
              </SettingsField>
              {enableCycles && (
                <>
                  <SettingsField
                    label="Auto-create cycles"
                    sublabel="How many upcoming cycles to pre-generate. Set to Off to create cycles manually."
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
                      className="max-w-[160px]"
                    />
                  </SettingsField>
                  {autoCreateLookahead !== "0" && (
                    <>
                      <SettingsField
                        label="Cadence"
                        sublabel="Default length for each cycle."
                      >
                        <Select
                          value={cycleDuration}
                          onChange={(v) => v && setCycleDuration(v)}
                          data={CYCLE_DURATION_OPTIONS}
                          size="xs"
                          comboboxProps={{ withinPortal: true }}
                          className="max-w-[160px]"
                        />
                      </SettingsField>
                      <SettingsField
                        label="Start day"
                        sublabel="Which day of the week cycles begin."
                      >
                        <Select
                          value={cycleStartDay}
                          onChange={(v) => v && setCycleStartDay(v)}
                          data={START_DAY_OPTIONS}
                          size="xs"
                          comboboxProps={{ withinPortal: true }}
                          className="max-w-[160px]"
                        />
                      </SettingsField>
                    </>
                  )}
                </>
              )}
            </SettingsSection>

            <SettingsSection
              icon={IconLayoutList}
              title="Stages"
              description="Workflow stages for each entity type."
            >
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
              />
            </SettingsSection>
          </>
        )}

        {section === "labels" && (
          <SettingsSection
            icon={IconTags}
            title="Labels & Areas"
            description="Labels are freeform tags for filtering (e.g. tech-debt, urgent). Areas group features by product area (e.g. Platform, Growth)."
          >
            <TagManagementSection workspaceId={workspaceId ?? ""} />
          </SettingsSection>
        )}

        {section === "workspace" && (
          <SettingsSection
            icon={IconArrowsExchange}
            title="Move to another workspace"
            description="Move this product and all of its data (tickets, features, research, and insights) to a workspace you belong to."
          >
            <SettingsField
              label="Destination workspace"
              sublabel="Only workspaces you're a member of are listed."
              action={
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconArrowsExchange size={14} />}
                  onClick={onMove}
                  loading={moveProduct.isPending}
                  disabled={!targetWorkspaceId}
                >
                  Move
                </Button>
              }
            >
              <Select
                value={targetWorkspaceId}
                onChange={setTargetWorkspaceId}
                placeholder={
                  moveTargets.length > 0
                    ? "Select a workspace…"
                    : "No other workspaces available"
                }
                disabled={moveTargets.length === 0}
                data={moveTargets.map((w) => ({ value: w.id, label: w.name }))}
                size="xs"
                comboboxProps={{ withinPortal: true }}
                className="max-w-xs"
              />
            </SettingsField>
            {moveError && (
              <Text size="sm" c="red" className="mt-3">
                {moveError}
              </Text>
            )}
          </SettingsSection>
        )}

        {section === "danger" && (
          <SettingsDangerZone icon={IconShieldExclamation}>
            <SettingsDangerRow
              title="Delete this product"
              description="Permanently removes all features, tickets, research, and retrospectives. This cannot be undone."
              action={
                <Button
                  color="red"
                  variant="outline"
                  size="xs"
                  onClick={onDelete}
                  loading={deleteProduct.isPending}
                >
                  Delete
                </Button>
              }
            />
          </SettingsDangerZone>
        )}
      </SettingsLayout>
    </SettingsShell>
  );
}
