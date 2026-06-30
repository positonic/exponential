'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Card,
  Group,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
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

type GroupBy = 'objective' | 'none';

/** Lane key for the Unaligned swimlane (features with no `goalId`). */
const UNALIGNED_KEY = '__unaligned__';

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
      <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
        {feature.name}
      </Text>
      <Group mt="xs" gap="xs" justify="space-between" wrap="nowrap">
        <ProductBadge product={feature.product} />
      </Group>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers — bucket a feature list into status columns.
// ---------------------------------------------------------------------------

function bucketByStatus(features: RoadmapFeature[]) {
  const map: Record<string, RoadmapFeature[]> = {};
  for (const col of FEATURE_STATUSES) map[col.value] = [];
  for (const f of features) (map[f.status] ??= []).push(f);
  return map;
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <Badge
      size="sm"
      variant="filled"
      color={color}
      styles={{ label: { color: 'var(--mantine-color-dark-9)' } }}
    >
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Flat (group-by: none) — one row of status columns.
// ---------------------------------------------------------------------------

function FlatBoard({
  features,
  prefix,
}: {
  features: RoadmapFeature[];
  prefix: string;
}) {
  const columns = useMemo(() => bucketByStatus(features), [features]);
  return (
    <div className="flex w-full min-w-0 gap-3 overflow-x-auto px-8 pt-4 pb-4">
      {FEATURE_STATUSES.map((col) => {
        const items = columns[col.value] ?? [];
        return (
          <Paper
            key={col.value}
            className="w-64 min-w-64 shrink-0"
            p="sm"
            radius="md"
            withBorder
          >
            <Group justify="space-between" mb="sm">
              <StatusBadge label={col.label} color={col.color} />
              <Text size="xs" fw={600} className="text-text-muted">
                {items.length}
              </Text>
            </Group>
            <Stack gap="xs">
              {items.map((f) => (
                <FeatureCard key={f.id} feature={f} prefix={prefix} />
              ))}
              {items.length === 0 && (
                <div className="flex h-16 items-center justify-center rounded-md border-2 border-dashed border-border-secondary">
                  <Text size="xs" className="text-text-muted">
                    No features
                  </Text>
                </div>
              )}
            </Stack>
          </Paper>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swimlanes (group-by: Objective) — one lane per Objective + an Unaligned lane.
// A shared header row of status labels sits above the lanes; every row uses the
// same fixed column widths so the (Objective × status) grid stays aligned.
// ---------------------------------------------------------------------------

interface Lane {
  key: string;
  title: string;
  isUnaligned: boolean;
  features: RoadmapFeature[];
}

function SwimlaneBoard({
  features,
  prefix,
}: {
  features: RoadmapFeature[];
  prefix: string;
}) {
  const lanes = useMemo<Lane[]>(() => {
    const aligned = new Map<string, Lane>();
    const unaligned: RoadmapFeature[] = [];
    for (const f of features) {
      if (f.goal) {
        const key = String(f.goal.id);
        const lane = aligned.get(key);
        if (lane) lane.features.push(f);
        else
          aligned.set(key, {
            key,
            title: f.goal.title,
            isUnaligned: false,
            features: [f],
          });
      } else {
        unaligned.push(f);
      }
    }
    const ordered = Array.from(aligned.values()).sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    if (unaligned.length > 0) {
      ordered.push({
        key: UNALIGNED_KEY,
        title: 'Unaligned',
        isUnaligned: true,
        features: unaligned,
      });
    }
    return ordered;
  }, [features]);

  return (
    <div className="w-full overflow-x-auto px-8 pt-4 pb-4">
      <div className="min-w-max">
        {/* Header row: lane-label gutter + status column labels */}
        <div className="flex gap-3">
          <div className="w-48 min-w-48 shrink-0" />
          {FEATURE_STATUSES.map((col) => (
            <div key={col.value} className="w-64 min-w-64 shrink-0 pb-1">
              <Group justify="space-between">
                <StatusBadge label={col.label} color={col.color} />
              </Group>
            </div>
          ))}
        </div>

        {/* Lanes */}
        <Stack gap="sm" mt="xs">
          {lanes.map((lane) => {
            const columns = bucketByStatus(lane.features);
            return (
              <div key={lane.key} className="flex gap-3">
                <div className="w-48 min-w-48 shrink-0 pt-1">
                  <Text
                    size="sm"
                    fw={600}
                    className={
                      lane.isUnaligned
                        ? 'text-text-muted italic'
                        : 'text-text-primary'
                    }
                    lineClamp={2}
                  >
                    {lane.title}
                  </Text>
                  <Text size="xs" className="text-text-muted">
                    {lane.features.length}{' '}
                    {lane.features.length === 1 ? 'feature' : 'features'}
                  </Text>
                </div>
                {FEATURE_STATUSES.map((col) => {
                  const items = columns[col.value] ?? [];
                  return (
                    <Paper
                      key={col.value}
                      className="w-64 min-w-64 shrink-0"
                      p="xs"
                      radius="md"
                      withBorder
                    >
                      <Stack gap="xs">
                        {items.map((f) => (
                          <FeatureCard key={f.id} feature={f} prefix={prefix} />
                        ))}
                        {items.length === 0 && (
                          <div className="flex h-12 items-center justify-center rounded-md border-2 border-dashed border-border-secondary">
                            <Text size="xs" className="text-text-muted">
                              —
                            </Text>
                          </div>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </div>
            );
          })}
        </Stack>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function ProductRoadmapBoard() {
  const { workspace, workspaceId } = useWorkspace();
  const prefix = workspace?.slug ? `/w/${workspace.slug}` : '';
  const [groupBy, setGroupBy] = useState<GroupBy>('objective');

  const { data: features, isLoading } =
    api.product.feature.listForWorkspace.useQuery(
      { workspaceId: workspaceId ?? '' },
      { enabled: !!workspaceId },
    );

  const toolbar = (
    <div className="flex items-center gap-2 px-8 pt-4">
      <Text size="xs" className="text-text-muted">
        Group by
      </Text>
      <SegmentedControl
        size="xs"
        value={groupBy}
        onChange={(v) => setGroupBy(v as GroupBy)}
        data={[
          { value: 'objective', label: 'Objective' },
          { value: 'none', label: 'None' },
        ]}
        styles={{
          root: {
            backgroundColor: 'var(--color-surface-secondary)',
            border: '1px solid var(--color-border-primary)',
          },
        }}
      />
    </div>
  );

  if (isLoading) {
    return (
      <>
        {toolbar}
        <div className="flex gap-3 overflow-x-auto px-8 pt-4 pb-4">
          {FEATURE_STATUSES.map((col) => (
            <Skeleton
              key={col.value}
              height={320}
              className="w-64 min-w-64 shrink-0"
              radius="md"
            />
          ))}
        </div>
      </>
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
    <>
      {toolbar}
      {groupBy === 'objective' ? (
        <SwimlaneBoard features={features} prefix={prefix} />
      ) : (
        <FlatBoard features={features} prefix={prefix} />
      )}
    </>
  );
}
