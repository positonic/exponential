"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button, Group, Select, Skeleton, Stack, Text } from "@mantine/core";
import { IconArrowLeft, IconPencil } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { ActivityTimeline } from "~/app/_components/shared/ActivityTimeline";
import { useFeatureActivity } from "~/hooks/useFeatureActivity";
import { ActivityFilterMenu, useActivityFilter } from "~/app/_components/shared/ActivityFilterMenu";
import { SCOPE_STATUS_OPTIONS, SCOPE_STATUS_COLORS } from "~/lib/feature-statuses";

/**
 * Scope detail page (Features V2): a Feature scope's own page beneath its
 * feature - deliberately minimal, only the description and an activity feed.
 * Everything else about a scope (requirements pinned to it, linked tickets,
 * docs) lives on the feature detail page.
 */
export default function ScopeDetailPage() {
  const params = useParams();
  const featureId = params.featureId as string;
  const scopeId = params.scopeId as string;
  const productSlug = params.productSlug as string;
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const { data: scope, isLoading } = api.product.feature.getScopeById.useQuery(
    { id: scopeId },
    { enabled: !!scopeId },
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (scope) setDraft(scope.description);
  }, [scope]);

  const activity = useFeatureActivity(featureId, { scopeId });
  const [activityFilter, setActivityFilter] = useActivityFilter();
  const updateScope = api.product.feature.updateScope.useMutation({
    onSuccess: async () => {
      setEditing(false);
      await utils.product.feature.getScopeById.invalidate({ id: scopeId });
      await utils.product.feature.getById.invalidate({ id: featureId });
      await utils.product.feature.listEvents.invalidate({ featureId, scopeId });
    },
  });

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={20} width={160} />
        <Skeleton height={32} width={320} />
        <Skeleton height={160} />
      </Stack>
    );
  }

  if (!scope) return <Text className="text-text-muted">Scope not found</Text>;

  const featurePath = `/w/${workspace?.slug}/products/${productSlug}/features/${featureId}`;

  return (
    <Stack gap="lg" className="max-w-3xl">
      {/* Back nav */}
      <Link
        href={featurePath}
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
      >
        <IconArrowLeft size={14} />
        {scope.feature.name}
      </Link>

      {/* Header: version + status */}
      <div>
        <Group gap="sm">
          <Text size="xl" fw={700} className="text-text-primary">
            {scope.version}
          </Text>
          <Select
            value={scope.status}
            onChange={(v) =>
              v &&
              updateScope.mutate({
                id: scope.id,
                status: v as "PLANNED" | "IN_PROGRESS" | "SHIPPED" | "DEPRECATED",
              })
            }
            data={SCOPE_STATUS_OPTIONS}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-xs font-medium cursor-pointer" }}
            styles={{
              input: {
                height: 22,
                minHeight: 22,
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
        <Text size="xs" className="text-text-muted mt-1">
          Scope of {scope.feature.name} · {scope.feature.product.name}
        </Text>
      </div>

      {/* Description */}
      <CollapsibleSection title="Description">
        {editing ? (
          <Stack gap="xs">
            <MarkdownInput
              value={draft}
              onChange={(v) => setDraft(v)}
              placeholder="What does this scope deliver?"
              minRows={4}
            />
            <Group gap="xs" justify="flex-end">
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setDraft(scope.description);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  const next = draft.trim();
                  if (next) updateScope.mutate({ id: scope.id, description: next });
                }}
                loading={updateScope.isPending}
                disabled={!draft.trim()}
              >
                Save
              </Button>
            </Group>
          </Stack>
        ) : (
          <div className="group relative border border-border-primary rounded-lg p-3">
            <MarkdownRenderer content={scope.description} />
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconPencil size={12} />}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          </div>
        )}
      </CollapsibleSection>

      {/* Activity - comments on this scope only. */}
      <CollapsibleSection
        title="Activity"
        action={<ActivityFilterMenu value={activityFilter} onChange={setActivityFilter} />}
      >
        <ActivityTimeline activity={activity} filter={activityFilter} />
      </CollapsibleSection>
    </Stack>
  );
}
