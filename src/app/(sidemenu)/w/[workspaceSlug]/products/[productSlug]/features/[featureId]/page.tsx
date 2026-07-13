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
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
  IconCategory,
  IconChecklist,
  IconCircleDot,
  IconCopy,
  IconDots,
  IconFileText,
  IconFlag,
  IconFlame,
  IconMap2,
  IconPlus,
  IconTag,
  IconTarget,
  IconTicket,
  IconTrash,
  IconUser,
  IconX,
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
import { PrdDocument } from "~/app/_components/prd/PrdDocument";
import {
  FEATURE_STATUS_OPTIONS,
  FEATURE_STATUS_COLORS,
  SCOPE_STATUS_OPTIONS,
  SCOPE_STATUS_COLORS,
  REQUIREMENT_KIND_OPTIONS,
  REQUIREMENT_KIND_LABELS,
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

  // Scope form
  const [scopeVersion, setScopeVersion] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");

  // Requirement form (EARS, ADR-0039)
  const [reqStatement, setReqStatement] = useState("");
  const [reqKind, setReqKind] = useState<string | null>(null);
  const [reqScopeId, setReqScopeId] = useState<string | null>(null);

  // Spec page picker
  const [pageToLink, setPageToLink] = useState<string | null>(null);

  const invalidateFeature = async () => {
    await utils.product.feature.getById.invalidate({ id: featureId });
    if (feature?.product.id) await utils.product.feature.list.invalidate({ productId: feature.product.id });
  };

  const updateFeature = api.product.feature.update.useMutation({
    onSuccess: invalidateFeature,
  });

  const addScope = api.product.feature.addScope.useMutation({
    onSuccess: async () => {
      setScopeVersion("");
      setScopeDescription("");
      await invalidateFeature();
    },
  });

  const updateScope = api.product.feature.updateScope.useMutation({
    onSuccess: invalidateFeature,
  });

  const deleteScope = api.product.feature.deleteScope.useMutation({
    onSuccess: invalidateFeature,
  });

  const addRequirement = api.product.feature.addRequirement.useMutation({
    onSuccess: async () => {
      setReqStatement("");
      setReqKind(null);
      setReqScopeId(null);
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const setRequirementChecked = api.product.feature.setRequirementChecked.useMutation({
    onSuccess: () => { void utils.product.feature.getById.invalidate({ id: featureId }); },
  });

  const deleteRequirement = api.product.feature.deleteRequirement.useMutation({
    onSuccess: () => { void utils.product.feature.getById.invalidate({ id: featureId }); },
  });

  const linkPage = api.product.feature.linkPage.useMutation({
    onSuccess: async () => {
      setPageToLink(null);
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const unlinkPage = api.product.feature.unlinkPage.useMutation({
    onSuccess: () => { void utils.product.feature.getById.invalidate({ id: featureId }); },
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

  const { data: workspacePages } = api.page.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
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
      modals.openConfirmModal({
        title: "Deprecate feature",
        children: (
          <Text size="sm">
            Also deprecate this feature&apos;s live scopes? The feature stays in
            the registry as product history either way.
          </Text>
        ),
        labels: { confirm: "Deprecate feature + scopes", cancel: "Feature only" },
        onConfirm: () =>
          updateFeature.mutate({ id: featureId, status: "DEPRECATED", deprecateScopes: true }),
        onCancel: () =>
          updateFeature.mutate({ id: featureId, status: "DEPRECATED" }),
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

          {/* PRD body - rich document (ADR-0024), replaces MarkdownRenderer here only.
              Editable for any workspace member (getById already gates membership). */}
          <PrdDocument
            featureId={featureId}
            descriptionDoc={(feature.descriptionDoc as JSONContent | null) ?? null}
            description={feature.description ?? null}
            docVersion={feature.docVersion}
            editable
            enableComments
          />

          {/* Vision */}
          {feature.vision && (
            <div className="border border-border-primary rounded-lg p-3">
              <Text size="xs" className="text-text-muted uppercase tracking-wider mb-1">Vision</Text>
              <MarkdownRenderer content={feature.vision} />
            </div>
          )}

          {/* Scopes */}
          <div>
            <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
              Scopes
            </Text>
            {feature.scopes.length > 0 ? (
              <div className="border border-border-primary rounded-lg overflow-hidden mb-3">
                {feature.scopes.map((scope, i) => (
                  <div key={scope.id} className={`flex items-start justify-between gap-3 px-3 py-2.5 ${i < feature.scopes.length - 1 ? "border-b border-border-primary" : ""}`}>
                    <div className="flex-1">
                      <Group gap="sm">
                        <Text size="sm" fw={500} className="text-text-primary">{scope.version}</Text>
                        <Select
                          value={scope.status}
                          onChange={(v) => v && updateScope.mutate({ id: scope.id, status: v as "PLANNED" | "IN_PROGRESS" | "SHIPPED" | "DEPRECATED" })}
                          data={SCOPE_STATUS_OPTIONS}
                          size="xs"
                          variant="unstyled"
                          comboboxProps={{ withinPortal: true }}
                          classNames={{ input: "text-xs font-medium cursor-pointer" }}
                          styles={{
                            input: {
                              height: 20,
                              minHeight: 20,
                              width: 110,
                              color: `var(--mantine-color-${SCOPE_STATUS_COLORS[scope.status] ?? "gray"}-5)`,
                            },
                          }}
                        />
                        {scope.shippedAt && (
                          <Text size="xs" className="text-text-muted">
                            live since {new Date(scope.shippedAt).toLocaleDateString()}
                          </Text>
                        )}
                      </Group>
                      <div className="mt-1">
                        <MarkdownRenderer content={scope.description} />
                      </div>
                    </div>
                    <ActionIcon variant="subtle" color="red" size="xs" onClick={() => deleteScope.mutate({ id: scope.id })}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </div>
                ))}
              </div>
            ) : (
              <Text size="xs" className="text-text-muted mb-3">No scopes yet.</Text>
            )}
            <div className="flex gap-2 items-end">
              <TextInput placeholder="Version (e.g. v1.0)" value={scopeVersion} onChange={(e) => setScopeVersion(e.currentTarget.value)} size="xs" className="w-28" />
              <TextInput placeholder="Description" value={scopeDescription} onChange={(e) => setScopeDescription(e.currentTarget.value)} size="xs" className="flex-1" />
              <Button size="xs" variant="light" leftSection={<IconPlus size={12} />} onClick={() => { if (scopeVersion.trim() && scopeDescription.trim()) addScope.mutate({ featureId, version: scopeVersion.trim(), description: scopeDescription.trim() }); }} loading={addScope.isPending} disabled={!scopeVersion.trim() || !scopeDescription.trim()}>
                Add
              </Button>
            </div>
          </div>

          {/* Requirements - checkable EARS statements (ADR-0039). Legacy user
              stories render read-only below while any remain; the write path
              is requirements only. */}
          <div>
            <Group gap="xs" mb={8}>
              <IconChecklist size={14} className="text-text-muted" />
              <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
                Requirements
              </Text>
              {feature.requirements.length > 0 && (
                <Text size="xs" className="text-text-muted">
                  {feature.requirements.filter((r) => r.checkedAt != null).length}/
                  {feature.requirements.length} met
                </Text>
              )}
            </Group>
            {feature.requirements.length > 0 ? (
              <div className="border border-border-primary rounded-lg overflow-hidden mb-3">
                {feature.requirements.map((req, i) => {
                  const reqScope = feature.scopes.find((s) => s.id === req.scopeId);
                  return (
                    <div key={req.id} className={`flex items-start gap-3 px-3 py-2.5 ${i < feature.requirements.length - 1 ? "border-b border-border-primary" : ""}`}>
                      <input
                        type="checkbox"
                        checked={req.checkedAt != null}
                        onChange={(e) =>
                          setRequirementChecked.mutate({ id: req.id, checked: e.currentTarget.checked })
                        }
                        className="mt-0.5 shrink-0 cursor-pointer accent-[var(--color-brand-primary)]"
                        aria-label="Requirement met"
                      />
                      <Text
                        size="sm"
                        className={`flex-1 min-w-0 ${req.checkedAt != null ? "text-text-muted line-through" : "text-text-primary"}`}
                      >
                        {req.statement}
                      </Text>
                      {req.kind && (
                        <Badge size="xs" variant="outline" color="gray" className="shrink-0">
                          {REQUIREMENT_KIND_LABELS[req.kind] ?? req.kind}
                        </Badge>
                      )}
                      {reqScope && (
                        <Badge size="xs" variant="light" color="gray" className="shrink-0">
                          {reqScope.version}
                        </Badge>
                      )}
                      <ActionIcon variant="subtle" color="red" size="xs" onClick={() => deleteRequirement.mutate({ id: req.id })}>
                        <IconTrash size={12} />
                      </ActionIcon>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Text size="xs" className="text-text-muted mb-3">
                No requirements yet. Write testable EARS statements: &quot;When
                &lt;trigger&gt;, the system shall &lt;response&gt;&quot;.
              </Text>
            )}
            <div className="flex gap-2 items-end">
              <TextInput
                placeholder="The system shall..."
                value={reqStatement}
                onChange={(e) => setReqStatement(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && reqStatement.trim()) {
                    e.preventDefault();
                    addRequirement.mutate({
                      featureId,
                      statement: reqStatement.trim(),
                      kind: (reqKind ?? undefined) as "FUNCTIONAL" | "NON_FUNCTIONAL" | "CONSTRAINT" | undefined,
                      scopeId: reqScopeId ?? undefined,
                    });
                  }
                }}
                size="xs"
                className="flex-1"
              />
              <Select
                placeholder="Kind"
                value={reqKind}
                onChange={setReqKind}
                data={REQUIREMENT_KIND_OPTIONS}
                size="xs"
                clearable
                className="w-36"
                comboboxProps={{ withinPortal: true }}
              />
              {feature.scopes.length > 0 && (
                <Select
                  placeholder="Scope"
                  value={reqScopeId}
                  onChange={setReqScopeId}
                  data={feature.scopes.map((s) => ({ value: s.id, label: s.version }))}
                  size="xs"
                  clearable
                  className="w-28"
                  comboboxProps={{ withinPortal: true }}
                />
              )}
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() =>
                  addRequirement.mutate({
                    featureId,
                    statement: reqStatement.trim(),
                    kind: (reqKind ?? undefined) as "FUNCTIONAL" | "NON_FUNCTIONAL" | "CONSTRAINT" | undefined,
                    scopeId: reqScopeId ?? undefined,
                  })
                }
                loading={addRequirement.isPending}
                disabled={!reqStatement.trim()}
              >
                Add
              </Button>
            </div>
            {feature.userStories.length > 0 && (
              <div className="mt-3">
                <Text size="xs" className="text-text-muted mb-1">
                  Legacy user stories (read-only - superseded by requirements, ADR-0039):
                </Text>
                <div className="border border-border-primary rounded-lg overflow-hidden opacity-70">
                  {feature.userStories.map((story, i) => (
                    <div key={story.id} className={`px-3 py-2 ${i < feature.userStories.length - 1 ? "border-b border-border-primary" : ""}`}>
                      <Text size="xs" className="text-text-secondary">
                        <span className="text-text-muted">As a</span> {story.asA ?? "-"}{" "}
                        <span className="text-text-muted">I want</span> {story.iWant ?? "-"}{" "}
                        <span className="text-text-muted">so that</span> {story.soThat ?? "-"}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Specs & docs - Knowledge pages (PRDs, research, technical specs)
              linked to this feature. The body above stays the living
              description; these are the moment-in-time arguments. */}
          <div>
            <Group gap="xs" mb={8}>
              <IconFileText size={14} className="text-text-muted" />
              <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
                Specs &amp; docs
              </Text>
            </Group>
            {feature.pages.length > 0 && (
              <div className="border border-border-primary rounded-lg overflow-hidden mb-3">
                {feature.pages.map((link, i) => {
                  const linkScope = feature.scopes.find((s) => s.id === link.scopeId);
                  return (
                    <div key={link.pageId} className={`flex items-center gap-3 px-3 py-2.5 ${i < feature.pages.length - 1 ? "border-b border-border-primary" : ""}`}>
                      <IconFileText size={14} className="text-text-muted shrink-0" />
                      <Link
                        href={`/w/${workspace?.slug}/pages/${link.pageId}`}
                        className="text-sm text-text-primary hover:underline flex-1 min-w-0 truncate"
                      >
                        {link.page.title}
                      </Link>
                      {linkScope && (
                        <Badge size="xs" variant="light" color="gray" className="shrink-0">
                          {linkScope.version}
                        </Badge>
                      )}
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="xs"
                        onClick={() => unlinkPage.mutate({ featureId, pageId: link.pageId })}
                        aria-label="Unlink page"
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </div>
                  );
                })}
              </div>
            )}
            <Group gap="xs">
              <Select
                placeholder="Link a page (PRD, spec, research)..."
                value={pageToLink}
                onChange={setPageToLink}
                data={(workspacePages ?? [])
                  .filter((p) => !feature.pages.some((l) => l.pageId === p.id))
                  .map((p) => ({ value: p.id, label: p.title }))}
                size="xs"
                searchable
                clearable
                nothingFoundMessage="No pages found"
                className="flex-1"
                comboboxProps={{ withinPortal: true }}
              />
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() => { if (pageToLink) linkPage.mutate({ featureId, pageId: pageToLink }); }}
                loading={linkPage.isPending}
                disabled={!pageToLink}
              >
                Link
              </Button>
            </Group>
          </div>

          {/* Linked insights */}
          {feature.insights.length > 0 && (
            <div>
              <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
                Linked insights
              </Text>
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
            </div>
          )}
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
