'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { FEATURE_STATUSES, type FeatureStatus } from '~/lib/feature-statuses';

type RoadmapFeature =
  RouterOutputs['product']['feature']['listForWorkspace'][number];
type RoadmapProduct = RoadmapFeature['product'];

type GroupBy = 'objective' | 'none';

/** Lane key for the Unaligned swimlane (features with no `goalId`). */
const UNALIGNED_KEY = '__unaligned__';
/** Lane key used by the flat (ungrouped) board. */
const FLAT_LANE_KEY = '__flat__';
/** Separator joining a lane key + status into a unique droppable cell id. */
const CELL_SEP = '::';

const STATUS_VALUES = new Set<string>(FEATURE_STATUSES.map((s) => s.value));

/**
 * A droppable cell id encodes both its lane and its status (`lane::STATUS`) so
 * every (Objective × status) cell is unique across swimlanes — dnd-kit requires
 * unique droppable ids. Horizontal status drag only reads the status half.
 */
function cellId(laneKey: string, status: string) {
  return `${laneKey}${CELL_SEP}${status}`;
}

/**
 * Resolve the target {@link FeatureStatus} of a drop. `over` may be a cell
 * (`lane::STATUS`) or another card (its feature id) when dropped onto a card —
 * in which case we look up that feature's status.
 */
function resolveTargetStatus(
  overId: string,
  featuresById: Map<string, RoadmapFeature>,
): FeatureStatus | null {
  if (overId.includes(CELL_SEP)) {
    const status = overId.slice(overId.lastIndexOf(CELL_SEP) + CELL_SEP.length);
    return STATUS_VALUES.has(status) ? (status as FeatureStatus) : null;
  }
  return featuresById.get(overId)?.status ?? null;
}

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

function FeatureCardBody({ feature }: { feature: RoadmapFeature }) {
  return (
    <>
      <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
        {feature.name}
      </Text>
      <Group mt="xs" gap="xs" justify="space-between" wrap="nowrap">
        <ProductBadge product={feature.product} />
      </Group>
    </>
  );
}

const FEATURE_CARD_CLASS =
  'border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors';

// ---------------------------------------------------------------------------
// Read-only card — a plain Link (viewers / guests get this).
// ---------------------------------------------------------------------------

function ReadonlyFeatureCard({
  feature,
  prefix,
}: {
  feature: RoadmapFeature;
  prefix: string;
}) {
  const href = `${prefix}/products/${feature.product.slug}/features/${feature.id}`;
  return (
    <Card component={Link} href={href} className={FEATURE_CARD_CLASS} padding="sm" radius="sm">
      <FeatureCardBody feature={feature} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Draggable card — horizontal drag changes status (members+). Click (when not
// dragging) navigates to the feature detail.
// ---------------------------------------------------------------------------

function DraggableFeatureCard({
  feature,
  prefix,
  isDragOverlay,
}: {
  feature: RoadmapFeature;
  prefix: string;
  isDragOverlay?: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: feature.id });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  return (
    <Card
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      className={`${FEATURE_CARD_CLASS} cursor-grab active:cursor-grabbing`}
      padding="sm"
      radius="sm"
      onClick={(e: React.MouseEvent) => {
        if (!isDragging && !isDragOverlay) {
          e.stopPropagation();
          router.push(
            `${prefix}/products/${feature.product.slug}/features/${feature.id}`,
          );
        }
      }}
    >
      <FeatureCardBody feature={feature} />
    </Card>
  );
}

function FeatureCard({
  feature,
  prefix,
  canEdit,
}: {
  feature: RoadmapFeature;
  prefix: string;
  canEdit: boolean;
}) {
  return canEdit ? (
    <DraggableFeatureCard feature={feature} prefix={prefix} />
  ) : (
    <ReadonlyFeatureCard feature={feature} prefix={prefix} />
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

/**
 * Droppable status cell. The cell is the drop target for horizontal status
 * drag; its id encodes its lane so cells stay unique across swimlanes.
 */
function StatusCell({
  laneKey,
  status,
  isEmpty,
  emptyHint,
  children,
}: {
  laneKey: string;
  status: string;
  isEmpty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(laneKey, status) });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md transition-all duration-200 ${
        isOver ? 'ring-2 ring-blue-400 ring-opacity-50 bg-surface-hover' : ''
      }`}
    >
      <Stack gap="xs" className="min-h-12">
        {children}
        {isEmpty && (
          <div className="flex h-12 items-center justify-center rounded-md border-2 border-dashed border-border-secondary">
            <Text size="xs" className="text-text-muted">
              {emptyHint}
            </Text>
          </div>
        )}
      </Stack>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flat (group-by: none) — one row of status columns.
// ---------------------------------------------------------------------------

function FlatBoard({
  features,
  prefix,
  canEdit,
}: {
  features: RoadmapFeature[];
  prefix: string;
  canEdit: boolean;
}) {
  const columns = useMemo(() => bucketByStatus(features), [features]);
  return (
    <div className="flex w-full min-w-0 gap-3 overflow-x-auto px-8 pt-4 pb-4">
      {FEATURE_STATUSES.map((col) => {
        const items = columns[col.value] ?? [];
        return (
          <Paper key={col.value} className="w-64 min-w-64 shrink-0" p="sm" radius="md" withBorder>
            <Group justify="space-between" mb="sm">
              <StatusBadge label={col.label} color={col.color} />
              <Text size="xs" fw={600} className="text-text-muted">
                {items.length}
              </Text>
            </Group>
            <StatusCell
              laneKey={FLAT_LANE_KEY}
              status={col.value}
              isEmpty={items.length === 0}
              emptyHint="No features"
            >
              {items.map((f) => (
                <FeatureCard key={f.id} feature={f} prefix={prefix} canEdit={canEdit} />
              ))}
            </StatusCell>
          </Paper>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swimlanes (group-by: Objective) — one lane per Objective + an Unaligned lane.
// ---------------------------------------------------------------------------

interface Lane {
  key: string;
  title: string;
  isUnaligned: boolean;
  features: RoadmapFeature[];
}

function buildLanes(features: RoadmapFeature[]): Lane[] {
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
}

function SwimlaneBoard({
  features,
  prefix,
  canEdit,
}: {
  features: RoadmapFeature[];
  prefix: string;
  canEdit: boolean;
}) {
  const lanes = useMemo(() => buildLanes(features), [features]);

  return (
    <div className="w-full overflow-x-auto px-8 pt-4 pb-4">
      <div className="min-w-max">
        {/* Header row: lane-label gutter + status column labels */}
        <div className="flex gap-3">
          <div className="w-48 min-w-48 shrink-0" />
          {FEATURE_STATUSES.map((col) => (
            <div key={col.value} className="w-64 min-w-64 shrink-0 pb-1">
              <StatusBadge label={col.label} color={col.color} />
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
                    className={lane.isUnaligned ? 'text-text-muted italic' : 'text-text-primary'}
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
                    <Paper key={col.value} className="w-64 min-w-64 shrink-0" p="xs" radius="md" withBorder>
                      <StatusCell
                        laneKey={lane.key}
                        status={col.value}
                        isEmpty={items.length === 0}
                        emptyHint="—"
                      >
                        {items.map((f) => (
                          <FeatureCard key={f.id} feature={f} prefix={prefix} canEdit={canEdit} />
                        ))}
                      </StatusCell>
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
  const { workspace, workspaceId, userRole } = useWorkspace();
  const prefix = workspace?.slug ? `/w/${workspace.slug}` : '';
  const [groupBy, setGroupBy] = useState<GroupBy>('objective');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    Record<string, FeatureStatus>
  >({});

  // A status drag writes `feature.update`, whose access check admits any
  // workspace member. Viewers/guests therefore get a read-only board — the
  // drag affordance is gated client-side on role (the server mutation is the
  // backstop for non-members). See ADR-0035 and the PR note.
  const canEdit =
    userRole === 'owner' || userRole === 'admin' || userRole === 'member';

  const { data, isLoading } = api.product.feature.listForWorkspace.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const utils = api.useUtils();
  const updateFeature = api.product.feature.update.useMutation({
    onSuccess: async () => {
      await utils.product.feature.listForWorkspace.invalidate({
        workspaceId: workspaceId ?? '',
      });
    },
    onError: (_err, variables) => {
      // Roll back the optimistic move.
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Apply optimistic status moves over the fetched data.
  const features = useMemo(() => {
    const base = data ?? [];
    if (Object.keys(optimisticMoves).length === 0) return base;
    return base.map((f) =>
      optimisticMoves[f.id] ? { ...f, status: optimisticMoves[f.id]! } : f,
    );
  }, [data, optimisticMoves]);

  const featuresById = useMemo(() => {
    const m = new Map<string, RoadmapFeature>();
    for (const f of features) m.set(f.id, f);
    return m;
  }, [features]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      if (!canEdit) return;
      const { active, over } = event;
      if (!over) return;

      const featureId = String(active.id);
      const nextStatus = resolveTargetStatus(String(over.id), featuresById);
      if (!nextStatus) return;

      const feature = featuresById.get(featureId);
      if (!feature || feature.status === nextStatus) return;

      setOptimisticMoves((prev) => ({ ...prev, [featureId]: nextStatus }));
      updateFeature.mutate({ id: featureId, status: nextStatus });
    },
    [canEdit, featuresById, updateFeature],
  );

  const activeFeature = activeId ? featuresById.get(activeId) : null;

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
            <Skeleton key={col.value} height={320} className="w-64 min-w-64 shrink-0" radius="md" />
          ))}
        </div>
      </>
    );
  }

  if (features.length === 0) {
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
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {groupBy === 'objective' ? (
          <SwimlaneBoard features={features} prefix={prefix} canEdit={canEdit} />
        ) : (
          <FlatBoard features={features} prefix={prefix} canEdit={canEdit} />
        )}
        <DragOverlay>
          {activeFeature ? (
            <DraggableFeatureCard feature={activeFeature} prefix={prefix} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
