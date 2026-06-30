'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Badge, Card, Group, Paper, Skeleton, Stack, Text } from '@mantine/core';
import { IconRoute } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import type { RouterOutputs } from '~/trpc/react';
import { EmptyState } from '~/app/_components/EmptyState';
import { getAvatarColor, getInitial } from '~/utils/avatarColors';
import { FEATURE_STATUSES } from '~/lib/feature-statuses';

type RoadmapFeature =
  RouterOutputs['product']['feature']['listForWorkspace'][number];
type RoadmapProduct = RoadmapFeature['product'];

// ---------------------------------------------------------------------------
// Product badge — small colored chip identifying the card's owning Product.
// `Product.icon` / `Product.color` are free-text and often unset, so fall back
// to a deterministic avatar color + the product's initial.
// ---------------------------------------------------------------------------

function ProductBadge({ product }: { product: RoadmapProduct }) {
  const dotStyle = {
    backgroundColor: product.color ?? getAvatarColor(product.id),
  };

  return (
    <Group gap={6} wrap="nowrap" align="center" className="min-w-0">
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] leading-none"
        style={dotStyle}
        aria-hidden
      >
        {product.icon ?? getInitial(product.name)}
      </span>
      <Text size="xs" className="text-text-muted truncate">
        {product.name}
      </Text>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Feature card (read-only in this slice — status changes happen on the
// feature detail surface; drag arrives in a later slice).
// ---------------------------------------------------------------------------

function FeatureCard({
  feature,
  prefix,
}: {
  feature: RoadmapFeature;
  prefix: string;
}) {
  const href = `${prefix}/products/${feature.product.slug}/features/${feature.id}`;
  return (
    <Card
      component={Link}
      href={href}
      className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors"
      padding="sm"
      radius="sm"
    >
      <Text
        size="sm"
        fw={500}
        className="text-text-primary"
        lineClamp={2}
      >
        {feature.name}
      </Text>
      <Group mt="xs" gap="xs" justify="space-between" wrap="nowrap">
        <ProductBadge product={feature.product} />
      </Group>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function BoardColumn({
  label,
  color,
  features,
  prefix,
}: {
  label: string;
  color: string;
  features: RoadmapFeature[];
  prefix: string;
}) {
  return (
    <Paper className="min-w-64 w-64 shrink-0" p="sm" radius="md" withBorder>
      <Group justify="space-between" mb="sm">
        <Badge
          size="sm"
          variant="filled"
          color={color}
          styles={{ label: { color: 'var(--mantine-color-dark-9)' } }}
        >
          {label}
        </Badge>
        <Text size="xs" fw={600} className="text-text-muted">
          {features.length}
        </Text>
      </Group>
      <Stack gap="xs">
        {features.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} prefix={prefix} />
        ))}
        {features.length === 0 && (
          <div className="flex h-16 items-center justify-center rounded-md border-2 border-dashed border-border-secondary">
            <Text size="xs" className="text-text-muted">
              No features
            </Text>
          </div>
        )}
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function ProductRoadmapBoard() {
  const { workspace, workspaceId } = useWorkspace();
  const prefix = workspace?.slug ? `/w/${workspace.slug}` : '';

  const { data: features, isLoading } =
    api.product.feature.listForWorkspace.useQuery(
      { workspaceId: workspaceId ?? '' },
      { enabled: !!workspaceId },
    );

  const columnFeatures = useMemo(() => {
    const map: Record<string, RoadmapFeature[]> = {};
    for (const col of FEATURE_STATUSES) map[col.value] = [];
    for (const f of features ?? []) {
      (map[f.status] ??= []).push(f);
    }
    return map;
  }, [features]);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto px-8 pt-6 pb-4">
        {FEATURE_STATUSES.map((col) => (
          <Skeleton key={col.value} height={320} className="min-w-64 w-64 shrink-0" radius="md" />
        ))}
      </div>
    );
  }

  if (!features || features.length === 0) {
    return (
      <div className="px-8 pt-6">
        <EmptyState
          icon={IconRoute}
          message="No features across your products yet. Create features inside a product to see them on the roadmap."
        />
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto px-8 pt-6 pb-4 w-full min-w-0">
      {FEATURE_STATUSES.map((col) => (
        <BoardColumn
          key={col.value}
          label={col.label}
          color={col.color}
          features={columnFeatures[col.value] ?? []}
          prefix={prefix}
        />
      ))}
    </div>
  );
}
