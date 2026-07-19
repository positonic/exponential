"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  NumberInput,
  Select,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
  IconCategory,
  IconCircleDot,
  IconCopy,
  IconDots,
  IconFlag,
  IconFlame,
  IconMap2,
  IconTag,
  IconTarget,
  IconTicket,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { MoveFeatureModal } from "~/app/_components/product/MoveFeatureModal";
import {
  PropertiesSidebar,
  PropertyRow,
  PropertyDivider,
} from "~/app/_components/PropertiesSidebar";
import { PriorityIcon } from "~/app/_components/product/PriorityIcon";
import { LabelsCombobox } from "~/app/_components/product/LabelsCombobox";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { FeatureBodyDocument } from "~/app/_components/prd/FeatureBodyDocument";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { FeatureDocsSection } from "~/app/_components/product/FeatureDocsSection";
import { FeatureScopesSection } from "~/app/_components/product/FeatureScopesSection";
import { FeatureRequirementsSection } from "~/app/_components/product/FeatureRequirementsSection";
import { FeatureActivitySection } from "~/app/_components/product/FeatureActivitySection";
import {
  FEATURE_STATUS_OPTIONS,
  FEATURE_STATUS_COLORS,
} from "~/lib/feature-statuses";
import type { JSONContent } from "@tiptap/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS = [
  { value: "0", label: "Urgent" },
  { value: "1", label: "High" },
  { value: "2", label: "Medium" },
  { value: "3", label: "Low" },
  { value: "4", label: "No priority" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeatureDetailPage() {
  const router = useRouter();
  const params = useParams();
  const featureId = params.featureId as string;
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: feature, isLoading } = api.product.feature.getById.useQuery(
    { id: featureId },
    { enabled: !!featureId },
  );

  const { data: tags } = api.tag.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const { data: goals } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  const setFeatureTags = api.tag.setFeatureTags.useMutation({
    onSuccess: async () => {
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const createTag = api.tag.create.useMutation({
    onSuccess: async (newTag) => {
      await utils.tag.list.invalidate();
      // Auto-add the newly created tag to this feature
      const currentIds = feature?.tags?.map((t: { tag: { id: string } }) => t.tag.id) ?? [];
      setFeatureTags.mutate({ featureId, tagIds: [...currentIds, newTag.id] });
    },
  });

  const [moveModalOpen, setMoveModalOpen] = useState(false);

  const invalidateFeature = async () => {
    await utils.product.feature.getById.invalidate({ id: featureId });
    await utils.product.feature.listEvents.invalidate({ featureId });
    if (feature?.product.id) await utils.product.feature.list.invalidate({ productId: feature.product.id });
  };

  const updateFeature = api.product.feature.update.useMutation({
    onSuccess: invalidateFeature,
  });

  const deleteFeature = api.product.feature.delete.useMutation({
    onSuccess: async () => {
      if (feature?.product.id) await utils.product.feature.list.invalidate({ productId: feature.product.id });
      if (workspace) router.push(`/w/${workspace.slug}/products/${productSlug}/features`);
    },
  });

  const { data: areas } = api.product.feature.listAreas.useQuery(
    { productId: feature?.product.id ?? "" },
    { enabled: !!feature?.product.id },
  );

  const handleFieldUpdate = (field: string, value: unknown) => {
    updateFeature.mutate({ id: featureId, [field]: value });
  };

  /**
   * Deprecating a feature prompts to also deprecate its LIVE scopes (never
   * implicit - see CONTEXT.md "Deprecated"). Planned or in-progress scopes
   * were never live, so they are never part of the cascade. Other statuses
   * apply directly.
   */
  const handleStatusChange = (val: string) => {
    const hasLiveScopes =
      (feature?.scopes ?? []).some((s) => s.status === "SHIPPED");
    if (val === "DEPRECATED" && hasLiveScopes) {
      // Three explicit actions - a true Cancel must exist; "cancel = also
      // deprecate" broke the back-out contract.
      const modalId = "deprecate-feature";
      const deprecate = (deprecateScopes: boolean) => {
        modals.close(modalId);
        updateFeature.mutate({
          id: featureId,
          status: "DEPRECATED",
          ...(deprecateScopes ? { deprecateScopes: true } : {}),
        });
      };
      modals.open({
        modalId,
        title: "Deprecate feature",
        children: (
          <Stack gap="md">
            <Text size="sm">
              Also deprecate this feature&apos;s live scopes? The feature stays in
              the registry as product history either way.
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" onClick={() => modals.close(modalId)}>
                Cancel
              </Button>
              <Button color="orange" variant="light" onClick={() => deprecate(false)}>
                Feature only
              </Button>
              <Button color="orange" onClick={() => deprecate(true)}>
                Feature + scopes
              </Button>
            </Group>
          </Stack>
        ),
      });
      return;
    }
    handleFieldUpdate("status", val);
  };

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={24} width={120} />
        <Skeleton height={36} width={400} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (!feature) return <Text className="text-text-muted">Feature not found</Text>;

  const backPath = `/w/${workspace?.slug}/products/${productSlug}/features`;

  return (
    <div className="flex min-h-0">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto pr-6">
        <Stack gap="lg">
          {/* Back nav */}
          <Link href={backPath} className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
            <IconArrowLeft size={14} />
            Features
          </Link>

          {/* Title + badges + overflow menu */}
          <div>
            <Group gap="sm" mb={8}>
              <Badge size="xs" variant="filled" color={FEATURE_STATUS_COLORS[feature.status] ?? "gray"} styles={{ label: { color: "var(--mantine-color-dark-9)" } }}>
                {FEATURE_STATUS_OPTIONS.find((s) => s.value === feature.status)?.label ?? feature.status}
              </Badge>
              {feature.area && (
                <Badge size="xs" variant="outline" color="gray" leftSection={<IconMap2 size={10} />}>
                  {feature.area.name}
                </Badge>
              )}
            </Group>

            <Group justify="space-between" align="flex-start">
              <Text size="xl" fw={700} className="text-text-primary flex-1">
                {feature.name}
              </Text>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" className="text-text-muted">
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => { void navigator.clipboard.writeText(window.location.href); }}>
                    Copy link
                  </Menu.Item>
                  <Menu.Item leftSection={<IconArrowRight size={14} />} onClick={() => setMoveModalOpen(true)}>
                    Move to another workspace…
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => {
                    modals.openConfirmModal({
                      title: "Delete feature",
                      children: <Text size="sm">This will permanently delete the feature and all its scopes and requirements.</Text>,
                      labels: { confirm: "Delete", cancel: "Cancel" },
                      confirmProps: { color: "red" },
                      onConfirm: () => deleteFeature.mutate({ id: featureId }),
                    });
                  }}>
                    Delete feature
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </div>

          {/* Description - the living rich document (ADR-0024). Editable for
              any workspace member (getById already gates membership). */}
          <CollapsibleSection title="Description">
            <Stack gap="md">
              <FeatureBodyDocument
                featureId={featureId}
                descriptionDoc={(feature.descriptionDoc as JSONContent | null) ?? null}
                description={feature.description ?? null}
                docVersion={feature.docVersion}
                editable
                enableComments
              />
              {feature.vision && (
                <div className="border border-border-primary rounded-lg p-3">
                  <Text size="xs" className="text-text-muted uppercase tracking-wider mb-1">Vision</Text>
                  <MarkdownRenderer content={feature.vision} />
                </div>
              )}
            </Stack>
          </CollapsibleSection>

          {/* Scopes - shared interactive block (same component as the peek) */}
          <CollapsibleSection
            title="Scopes"
            meta={feature.scopes.length > 0 ? String(feature.scopes.length) : undefined}
          >
            <FeatureScopesSection
              featureId={featureId}
              productId={feature.product.id}
              scopes={feature.scopes}
              scopesPath={`${backPath}/${featureId}/scopes`}
            />
          </CollapsibleSection>

          {/* Requirements - checkable EARS statements (ADR-0039). Legacy user
              stories render read-only below while any remain; the write path
              is requirements only. */}
          <CollapsibleSection
            title="Requirements"
            meta={
              feature.requirements.length > 0
                ? `${feature.requirements.filter((r) => r.checkedAt != null).length}/${feature.requirements.length} met`
                : undefined
            }
          >
            <FeatureRequirementsSection
              featureId={featureId}
              requirements={feature.requirements}
              scopes={feature.scopes}
              userStories={feature.userStories}
            />
          </CollapsibleSection>

          {/* Docs - Knowledge pages (PRDs, research, technical specs) linked
              to this feature. The body above stays the living description;
              these are the moment-in-time arguments. */}
          <CollapsibleSection
            title="Docs"
            meta={feature.pages.length > 0 ? String(feature.pages.length) : undefined}
          >
            <FeatureDocsSection
              featureId={featureId}
              featureName={feature.name}
              workspaceId={workspaceId}
              workspaceSlug={workspace?.slug}
              pages={feature.pages}
              scopes={feature.scopes}
            />
          </CollapsibleSection>

          {/* Linked insights */}
          {feature.insights.length > 0 && (
            <CollapsibleSection
              title="Linked insights"
              meta={String(feature.insights.length)}
            >
              <div className="border border-border-primary rounded-lg overflow-hidden">
                {feature.insights.map((link, i) => (
                  <div key={link.insight.id} className={`flex items-center gap-3 px-3 py-2.5 ${i < feature.insights.length - 1 ? "border-b border-border-primary" : ""}`}>
                    <Badge size="xs" variant="light">
                      {link.insight.type.toLowerCase().replace("_", " ")}
                    </Badge>
                    <Text size="sm" className="text-text-primary flex-1" lineClamp={1}>
                      {link.insight.title ?? link.insight.description}
                    </Text>
                    {link.insight.source && (
                      <Text size="xs" className="text-text-muted">{link.insight.source}</Text>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Activity - feature-level comments, ticket-detail pattern. */}
          <CollapsibleSection title="Activity">
            <FeatureActivitySection featureId={featureId} />
          </CollapsibleSection>
        </Stack>
      </div>

      {/* Properties sidebar */}
      <PropertiesSidebar>
        <PropertyRow icon={<IconCircleDot size={14} />} label="Status">
          <Select
            value={feature.status}
            onChange={(val) => val && handleStatusChange(val)}
            data={FEATURE_STATUS_OPTIONS}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconMap2 size={14} />} label="Area">
          <Select
            value={feature.areaId}
            onChange={(val) => handleFieldUpdate("areaId", val)}
            data={(areas ?? []).map((a) => ({ value: a.id, label: a.name }))}
            size="xs"
            variant="unstyled"
            clearable
            placeholder="None"
            nothingFoundMessage="No areas yet"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconFlag size={14} />} label="Priority">
          <Select
            value={feature.priority != null ? String(feature.priority) : undefined}
            onChange={(val) => handleFieldUpdate("priority", val != null ? Number(val) : null)}
            data={PRIORITY_OPTIONS}
            size="xs"
            variant="unstyled"
            clearable
            placeholder="None"
            comboboxProps={{ withinPortal: true }}
            renderOption={({ option }) => (
              <div className="flex items-center gap-2">
                <PriorityIcon priority={Number(option.value)} size={14} />
                <span>{option.label}</span>
              </div>
            )}
            leftSection={<PriorityIcon priority={feature.priority} size={14} />}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24, paddingLeft: 24 } }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconFlame size={14} />} label="Effort">
          <NumberInput
            value={feature.effort ?? ""}
            onChange={(val) => handleFieldUpdate("effort", val === "" ? null : Number(val))}
            size="xs"
            variant="unstyled"
            min={0}
            placeholder="None"
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24, width: 80 } }}
          />
        </PropertyRow>

        <PropertyDivider />

        <PropertyRow icon={<IconTarget size={14} />} label="Goal">
          <Select
            value={feature.goalId != null ? String(feature.goalId) : null}
            onChange={(val) => handleFieldUpdate("goalId", val != null ? Number(val) : null)}
            data={(goals ?? []).map((g) => ({ value: String(g.id), label: g.title }))}
            size="xs"
            variant="unstyled"
            clearable
            searchable
            placeholder="None"
            nothingFoundMessage="No goals"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconTicket size={14} />} label="Tickets">
          <Text size="xs" className="text-text-primary">
            {feature._count.tickets}
          </Text>
        </PropertyRow>

        <PropertyRow icon={<IconCategory size={14} />} label="Scopes">
          <Text size="xs" className="text-text-primary">
            {feature.scopes.length}
          </Text>
        </PropertyRow>

        <PropertyRow icon={<IconTag size={14} />} label="Labels">
          <LabelsCombobox
            selectedIds={feature.tags?.map((t: { tag: { id: string } }) => t.tag.id) ?? []}
            allTags={tags?.allTags ?? []}
            entityTags={feature.tags ?? []}
            onChange={(tagIds) => setFeatureTags.mutate({ featureId, tagIds })}
            onCreate={(name) => {
              if (workspaceId) createTag.mutate({ name, color: "avatar-blue", workspaceId });
            }}
          />
        </PropertyRow>

        <PropertyDivider />

        <PropertyRow icon={<IconUser size={14} />} label="Created by">
          <Group gap="xs">
            <Avatar size={18} radius="xl">
              {(feature.createdBy?.name ?? "?")[0]?.toUpperCase()}
            </Avatar>
            <Text size="xs" className="text-text-muted">
              {feature.createdBy?.name ?? "Unknown"}
            </Text>
          </Group>
        </PropertyRow>

        <PropertyRow icon={<IconCalendar size={14} />} label="Created">
          <Text size="xs" className="text-text-muted">
            {new Date(feature.createdAt).toLocaleDateString()}
          </Text>
        </PropertyRow>
      </PropertiesSidebar>

      <MoveFeatureModal
        opened={moveModalOpen}
        onClose={() => setMoveModalOpen(false)}
        featureId={featureId}
        currentProductId={feature.product.id}
        currentWorkspaceId={feature.product.workspaceId}
      />
    </div>
  );
}
