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
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowLeft,
  IconCalendar,
  IconCategory,
  IconCircleDot,
  IconCopy,
  IconDots,
  IconFlag,
  IconFlame,
  IconPlus,
  IconTag,
  IconTarget,
  IconTicket,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import {
  PropertiesSidebar,
  PropertyRow,
  PropertyDivider,
} from "~/app/_components/PropertiesSidebar";
import { PriorityIcon } from "~/app/_components/product/PriorityIcon";
import { TagBadge } from "~/app/_components/TagBadge";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "IDEA", label: "Idea" },
  { value: "DEFINED", label: "Defined" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "ARCHIVED", label: "Archived" },
];

const STATUS_COLORS: Record<string, string> = {
  IDEA: "gray",
  DEFINED: "blue",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  ARCHIVED: "dark",
};

const PRIORITY_OPTIONS = [
  { value: "0", label: "Urgent" },
  { value: "1", label: "High" },
  { value: "2", label: "Medium" },
  { value: "3", label: "Low" },
  { value: "4", label: "No priority" },
];

const SCOPE_STATUS_COLORS: Record<string, string> = {
  PLANNED: "gray",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  DEPRECATED: "red",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeatureDetailPage() {
  const router = useRouter();
  const params = useParams();
  const featureId = params.featureId as string;
  const productSlug = params.productSlug as string;
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const { data: feature, isLoading } = api.product.feature.getById.useQuery(
    { id: featureId },
    { enabled: !!featureId },
  );

  // Scope form
  const [scopeVersion, setScopeVersion] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");

  // Story form
  const [storyAsA, setStoryAsA] = useState("");
  const [storyIWant, setStoryIWant] = useState("");
  const [storySoThat, setStorySoThat] = useState("");
  const [storyScopeId, setStoryScopeId] = useState<string | null>(null);

  const updateFeature = api.product.feature.update.useMutation({
    onSuccess: async () => {
      await utils.product.feature.getById.invalidate({ id: featureId });
      if (feature?.product.id) await utils.product.feature.list.invalidate({ productId: feature.product.id });
    },
  });

  const addScope = api.product.feature.addScope.useMutation({
    onSuccess: async () => {
      setScopeVersion("");
      setScopeDescription("");
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const deleteScope = api.product.feature.deleteScope.useMutation({
    onSuccess: () => { void utils.product.feature.getById.invalidate({ id: featureId }); },
  });

  const addUserStory = api.product.feature.addUserStory.useMutation({
    onSuccess: async () => {
      setStoryAsA("");
      setStoryIWant("");
      setStorySoThat("");
      setStoryScopeId(null);
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });

  const deleteUserStory = api.product.feature.deleteUserStory.useMutation({
    onSuccess: () => { void utils.product.feature.getById.invalidate({ id: featureId }); },
  });

  const deleteFeature = api.product.feature.delete.useMutation({
    onSuccess: async () => {
      if (feature?.product.id) await utils.product.feature.list.invalidate({ productId: feature.product.id });
      if (workspace) router.push(`/w/${workspace.slug}/products/${productSlug}/features`);
    },
  });

  const handleFieldUpdate = (field: string, value: unknown) => {
    updateFeature.mutate({ id: featureId, [field]: value });
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
              <Badge size="xs" variant="filled" color={STATUS_COLORS[feature.status] ?? "gray"} styles={{ label: { color: "var(--mantine-color-dark-9)" } }}>
                {STATUS_OPTIONS.find((s) => s.value === feature.status)?.label ?? feature.status}
              </Badge>
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
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => {
                    modals.openConfirmModal({
                      title: "Delete feature",
                      children: <Text size="sm">This will permanently delete the feature and all its scopes and user stories.</Text>,
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

          {/* Description */}
          {feature.description ? (
            <Text size="sm" className="text-text-muted">{feature.description}</Text>
          ) : (
            <Text size="sm" className="text-text-muted">No description provided.</Text>
          )}

          {/* Vision */}
          {feature.vision && (
            <div className="border border-border-primary rounded-lg p-3">
              <Text size="xs" className="text-text-muted uppercase tracking-wider mb-1">Vision</Text>
              <Text size="sm" className="text-text-primary">{feature.vision}</Text>
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
                        <Badge size="xs" variant="light" color={SCOPE_STATUS_COLORS[scope.status] ?? "gray"}>
                          {scope.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      </Group>
                      <Text size="xs" className="text-text-muted mt-1 whitespace-pre-wrap">{scope.description}</Text>
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

          {/* User stories */}
          <div>
            <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
              User stories
            </Text>
            {feature.userStories.length > 0 ? (
              <div className="border border-border-primary rounded-lg overflow-hidden mb-3">
                {feature.userStories.map((story, i) => (
                  <div key={story.id} className={`flex items-start justify-between gap-3 px-3 py-2.5 ${i < feature.userStories.length - 1 ? "border-b border-border-primary" : ""}`}>
                    <Text size="sm" className="text-text-primary flex-1">
                      <span className="text-text-muted">As a</span> {story.asA ?? "-"}{" "}
                      <span className="text-text-muted">I want</span> {story.iWant ?? "-"}{" "}
                      <span className="text-text-muted">so that</span> {story.soThat ?? "-"}
                    </Text>
                    <ActionIcon variant="subtle" color="red" size="xs" onClick={() => deleteUserStory.mutate({ id: story.id })}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </div>
                ))}
              </div>
            ) : (
              <Text size="xs" className="text-text-muted mb-3">No stories yet.</Text>
            )}
            <div className="flex gap-2 items-end">
              <TextInput placeholder="As a..." value={storyAsA} onChange={(e) => setStoryAsA(e.currentTarget.value)} size="xs" className="flex-1" />
              <TextInput placeholder="I want..." value={storyIWant} onChange={(e) => setStoryIWant(e.currentTarget.value)} size="xs" className="flex-1" />
              <TextInput placeholder="So that..." value={storySoThat} onChange={(e) => setStorySoThat(e.currentTarget.value)} size="xs" className="flex-1" />
              <Button size="xs" variant="light" leftSection={<IconPlus size={12} />} onClick={() => { if (storyIWant.trim()) addUserStory.mutate({ featureId, scopeId: storyScopeId ?? undefined, asA: storyAsA.trim() || undefined, iWant: storyIWant.trim() || undefined, soThat: storySoThat.trim() || undefined }); }} loading={addUserStory.isPending} disabled={!storyIWant.trim()}>
                Add
              </Button>
            </div>
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
            onChange={(val) => val && handleFieldUpdate("status", val)}
            data={STATUS_OPTIONS}
            size="xs"
            variant="unstyled"
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
          <Text size="xs" className="text-text-primary">
            {feature.effort != null ? String(feature.effort) : "None"}
          </Text>
        </PropertyRow>

        <PropertyDivider />

        <PropertyRow icon={<IconTarget size={14} />} label="Goal">
          <Text size="xs" className={feature.goal ? "text-text-primary" : "text-text-muted"}>
            {feature.goal?.title ?? "None"}
          </Text>
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
          {feature.tags && feature.tags.length > 0 ? (
            <Group gap={4}>
              {feature.tags.map((t: { tag: { id: string; name: string; color: string } }) => (
                <TagBadge key={t.tag.id} tag={t.tag} size="xs" />
              ))}
            </Group>
          ) : (
            <Text size="xs" className="text-text-muted">None</Text>
          )}
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
    </div>
  );
}
