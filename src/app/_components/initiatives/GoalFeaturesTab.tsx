"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Group,
  Skeleton,
  Switch,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconBulb, IconRoute } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import type { RouterOutputs } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { PeekDrawer } from "~/app/_components/product/peek/PeekDrawer";
import { FeaturePeek } from "~/app/_components/product/peek/FeaturePeek";
import {
  PriorityIcon,
  PRIORITY_LABELS,
} from "~/app/_components/product/PriorityIcon";
import { ProductBadge } from "~/app/_components/products/ProductRoadmapBoard";
import {
  FEATURE_STATUSES,
  HIDDEN_FEATURE_STATUSES,
  type FeatureStatus,
} from "~/lib/feature-statuses";

type GoalFeature = RouterOutputs["product"]["feature"]["listForGoal"][number];

const COLUMN_COUNT = 6;

interface GoalFeaturesTabProps {
  goalId: number;
  workspaceSlug: string;
}

/**
 * The Objective page's Features tab: every Feature **aligned** to this
 * Objective (`Feature.goalId`), across all of the workspace's Products,
 * grouped by stage. Read-only - a row opens the Feature's peek, which is the
 * one place a Feature (and its alignment) is edited from here. Deprecated and
 * Archived Features hide behind a toggle, as on the Product Roadmap.
 */
export function GoalFeaturesTab({ goalId, workspaceSlug }: GoalFeaturesTabProps) {
  const [showHidden, setShowHidden] = useState(false);
  const [peekFeature, setPeekFeature] = useState<GoalFeature | null>(null);

  const { data: features, isLoading } =
    api.product.feature.listForGoal.useQuery({ goalId });

  const hiddenCount = useMemo(
    () =>
      (features ?? []).filter((f) =>
        HIDDEN_FEATURE_STATUSES.includes(f.status as FeatureStatus),
      ).length,
    [features],
  );

  const groups = useMemo(() => {
    const byStatus = new Map<string, GoalFeature[]>();
    for (const feature of features ?? []) {
      const list = byStatus.get(feature.status) ?? [];
      list.push(feature);
      byStatus.set(feature.status, list);
    }
    return FEATURE_STATUSES.filter(
      (s) => showHidden || !HIDDEN_FEATURE_STATUSES.includes(s.value),
    )
      .map((s) => ({ status: s, features: byStatus.get(s.value) ?? [] }))
      .filter((g) => g.features.length > 0);
  }, [features, showHidden]);

  if (isLoading) {
    return <Skeleton height={160} />;
  }

  const roadmapHref = `/w/${workspaceSlug}/products-roadmap`;

  if (!features || features.length === 0) {
    return (
      <EmptyState
        icon={IconBulb}
        title="No aligned features"
        message="No features are aligned to this goal yet. Drag a feature into this goal's lane on the Product Roadmap to align it."
        action={
          <Button
            component={Link}
            href={roadmapHref}
            variant="light"
            size="xs"
            leftSection={<IconRoute size={14} />}
          >
            Open Product Roadmap
          </Button>
        }
      />
    );
  }

  const productSlug = peekFeature?.product.slug;
  const featureBasePath = productSlug
    ? `/w/${workspaceSlug}/products/${productSlug}`
    : null;

  return (
    <>
      {hiddenCount > 0 && (
        <Group justify="flex-end" mb="sm">
          <Switch
            size="xs"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.currentTarget.checked)}
            label={`Show deprecated & archived (${hiddenCount})`}
          />
        </Group>
      )}

      {groups.length === 0 ? (
        <Text size="sm" c="dimmed">
          Every aligned feature is deprecated or archived.
        </Text>
      ) : (
        <Table verticalSpacing="sm" highlightOnHover={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="text-text-muted">Name</Table.Th>
              <Table.Th className="text-text-muted">Product</Table.Th>
              <Table.Th className="text-text-muted">Area</Table.Th>
              <Table.Th className="text-text-muted">Priority</Table.Th>
              <Table.Th className="text-text-muted">Tickets</Table.Th>
              <Table.Th className="text-text-muted">Key results</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groups.map(({ status, features: rows }) => (
              <React.Fragment key={status.value}>
                <Table.Tr>
                  <Table.Td colSpan={COLUMN_COUNT} className="py-1">
                    <Text size="xs" c="dimmed" fw={500}>
                      {status.label} · {rows.length}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {rows.map((feature) => (
                  <FeatureRow
                    key={feature.id}
                    feature={feature}
                    onOpen={() => setPeekFeature(feature)}
                  />
                ))}
              </React.Fragment>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {/* No onPrev/onNext: the peek opens over this tab without list
          navigation, so its j/k keys never fight the goal page's. */}
      <PeekDrawer
        label="Feature details"
        opened={!!peekFeature}
        onClose={() => setPeekFeature(null)}
        fullPageHref={
          peekFeature && featureBasePath
            ? `${featureBasePath}/features/${peekFeature.id}`
            : null
        }
      >
        {peekFeature && featureBasePath && (
          <FeaturePeek featureId={peekFeature.id} basePath={featureBasePath} />
        )}
      </PeekDrawer>
    </>
  );
}

function FeatureRow({
  feature,
  onOpen,
}: {
  feature: GoalFeature;
  onOpen: () => void;
}) {
  const keyResults = feature.keyResultLinks.map((link) => link.keyResult);
  const priorityLabel = PRIORITY_LABELS[feature.priority ?? 4] ?? "No priority";

  return (
    <Table.Tr
      className="cursor-pointer transition-colors hover:bg-surface-hover"
      tabIndex={0}
      role="button"
      aria-label={`Open ${feature.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <Table.Td>
        <Group gap="sm" wrap="nowrap">
          <IconBulb size={14} className="flex-shrink-0 text-text-muted" />
          <Text size="sm" className="text-text-primary">
            {feature.name}
          </Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <ProductBadge product={feature.product} />
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {feature.area?.name ?? "---"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Tooltip label={priorityLabel}>
          <span className="inline-flex">
            <PriorityIcon priority={feature.priority} size={14} />
          </span>
        </Tooltip>
      </Table.Td>
      <Table.Td>
        <Text size="sm" className="tabular-nums text-text-secondary">
          {feature._count.tickets}
        </Text>
      </Table.Td>
      <Table.Td>
        {keyResults.length > 0 ? (
          <Group gap={4} wrap="wrap">
            {keyResults.map((kr) => (
              <Tooltip key={kr.id} label={kr.title}>
                <Badge
                  size="xs"
                  variant="light"
                  color="gray"
                  className="max-w-[180px] normal-case"
                >
                  <span className="truncate">{kr.title}</span>
                </Badge>
              </Tooltip>
            ))}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            ---
          </Text>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
