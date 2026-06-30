'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
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
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconRoute } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import type { RouterOutputs } from '~/trpc/react';
import { EmptyState } from '~/app/_components/EmptyState';
import { getAvatarColor, getInitial } from '~/utils/avatarColors';
import {
  FEATURE_STATUSES,
  ROADMAP_BOARD_COLUMNS,
  ARCHIVED_FEATURE_STATUS,
  type FeatureStatus,
} from '~/lib/feature-statuses';

type RoadmapFeature =
  RouterOutputs['product']['feature']['listForWorkspace'][number];
type RoadmapProduct = RoadmapFeature['product'];
type RoadmapColumn = (typeof FEATURE_STATUSES)[number];

type GroupBy = 'objective' | 'none';

/** Lane key for the Unaligned swimlane (features with no `goalId`). */
const UNALIGNED_KEY = '__unaligned__';
/** Lane key used by the flat (ungrouped) board. */
const FLAT_LANE_KEY = '__flat__';
/** Separator joining a lane key + status into a unique droppable cell id. */
const CELL_SEP = '::';
/** Prefix marking a droppable as a swimlane *header* (the re-align drop zone). */
const LANE_HEADER_PREFIX = 'lane-header';

const STATUS_VALUES = new Set<string>(FEATURE_STATUSES.map((s) => s.value));

/** Droppable id for a swimlane's header (the Objective re-align drop zone). */
function laneHeaderId(laneKey: string) {
  return `${LANE_HEADER_PREFIX}${CELL_SEP}${laneKey}`;
}

/** If `overId` is a lane header, return its lane key; otherwise null. */
function parseLaneHeader(overId: string): string | null {
  const head = `${LANE_HEADER_PREFIX}${CELL_SEP}`;
  return overId.startsWith(head) ? overId.slice(head.length) : null;
}

/**
 * The target `goalId` for a re-align drop onto a lane header. A lane's key *is*
 * its Objective's id (or the Unaligned sentinel), so the goalId is derived
 * directly — dropping onto Unaligned clears alignment (`null`).
 */
function laneKeyToGoalId(laneKey: string): number | null {
  return laneKey === UNALIGNED_KEY ? null : Number(laneKey);
}

/**
 * Prefer the droppable under the pointer (so the narrow lane *header* is a
 * reliable target) and fall back to rectangle overlap for column cells.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};

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
  columns,
}: {
  features: RoadmapFeature[];
  prefix: string;
  canEdit: boolean;
  columns: RoadmapColumn[];
}) {
  const buckets = useMemo(() => bucketByStatus(features), [features]);
  return (
    <div className="flex w-full min-w-0 gap-3 overflow-x-auto px-8 pt-4 pb-4">
      {columns.map((col) => {
        const items = buckets[col.value] ?? [];
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
  goalId: number | null;
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
          goalId: f.goal.id,
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
      goalId: null,
      isUnaligned: true,
      features: unaligned,
    });
  }
  return ordered;
}

/**
 * A swimlane's label gutter, doubling as the droppable re-align target. Dropping
 * a card here re-aligns it to this lane's Objective (or clears alignment for the
 * Unaligned lane). The header is the *only* re-align drop zone — a status
 * (column) drag never re-homes the OKR (ADR-0035).
 */
function LaneHeader({ lane, canEdit }: { lane: Lane; canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: laneHeaderId(lane.key),
    disabled: !canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      className={`w-48 min-w-48 shrink-0 rounded-md pt-1 transition-all duration-200 ${
        isOver ? 'ring-2 ring-blue-400 ring-opacity-50 bg-surface-hover' : ''
      }`}
    >
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
  );
}

function SwimlaneBoard({
  features,
  prefix,
  canEdit,
  columns,
}: {
  features: RoadmapFeature[];
  prefix: string;
  canEdit: boolean;
  columns: RoadmapColumn[];
}) {
  const lanes = useMemo(() => buildLanes(features), [features]);

  return (
    <div className="w-full overflow-x-auto px-8 pt-4 pb-4">
      <div className="min-w-max">
        {/* Header row: lane-label gutter + status column labels */}
        <div className="flex gap-3">
          <div className="w-48 min-w-48 shrink-0" />
          {columns.map((col) => (
            <div key={col.value} className="w-64 min-w-64 shrink-0 pb-1">
              <StatusBadge label={col.label} color={col.color} />
            </div>
          ))}
        </div>

        {/* Lanes */}
        <Stack gap="sm" mt="xs">
          {lanes.map((lane) => {
            const buckets = bucketByStatus(lane.features);
            return (
              <div key={lane.key} className="flex gap-3">
                <LaneHeader lane={lane} canEdit={canEdit} />
                {columns.map((col) => {
                  const items = buckets[col.value] ?? [];
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
  // ARCHIVED is a hidden filter, not a column (default off); SHIPPED is bounded
  // to the current OKR period by default (ADR-0035, slice teal.mango).
  const [showArchived, setShowArchived] = useState(false);
  const [showAllShipped, setShowAllShipped] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<
    Record<string, FeatureStatus>
  >({});
  // Optimistic Objective re-aligns: featureId → its new goal (or null when
  // re-aligned into the Unaligned lane). Carries the full goal so the card
  // jumps swimlanes immediately (lane grouping reads `goal`, not just goalId).
  const [optimisticAligns, setOptimisticAligns] = useState<
    Record<string, RoadmapFeature['goal']>
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
      // Roll back the optimistic move (status and/or re-align — a single drag
      // triggers one of them, so clearing both for this feature is safe).
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      setOptimisticAligns((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Apply optimistic status moves + Objective re-aligns over the fetched data.
  const features = useMemo(() => {
    const base = data ?? [];
    if (
      Object.keys(optimisticMoves).length === 0 &&
      Object.keys(optimisticAligns).length === 0
    ) {
      return base;
    }
    return base.map((f) => {
      let next = f;
      if (optimisticMoves[f.id]) {
        next = { ...next, status: optimisticMoves[f.id]! };
      }
      if (f.id in optimisticAligns) {
        const goal = optimisticAligns[f.id] ?? null;
        next = { ...next, goal, goalId: goal?.id ?? null };
      }
      return next;
    });
  }, [data, optimisticMoves, optimisticAligns]);

  const featuresById = useMemo(() => {
    const m = new Map<string, RoadmapFeature>();
    for (const f of features) m.set(f.id, f);
    return m;
  }, [features]);

  // goalId → its lean goal, so a re-align onto a lane header can set the card's
  // goal (for the optimistic lane jump) without an extra lookup.
  const goalsById = useMemo(() => {
    const m = new Map<number, NonNullable<RoadmapFeature['goal']>>();
    for (const f of features) if (f.goal) m.set(f.goal.id, f.goal);
    return m;
  }, [features]);

  // Start of the current OKR period (quarter) — the SHIPPED bound. Computed
  // once at mount; v1 uses `Feature.updatedAt` as a coarse shipped-at proxy
  // (FeatureScope.shippedAt is the precise signal for a later refinement).
  const quarterStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  }, []);

  // Columns: ARCHIVED only appears as a column when revealed.
  const columns = showArchived ? FEATURE_STATUSES : ROADMAP_BOARD_COLUMNS;

  // Apply the ARCHIVED + SHIPPED-period filters to what the board renders.
  const visibleFeatures = useMemo(
    () =>
      features.filter((f) => {
        if (f.status === ARCHIVED_FEATURE_STATUS) return showArchived;
        if (f.status === 'SHIPPED' && !showAllShipped) {
          return new Date(f.updatedAt).getTime() >= quarterStart.getTime();
        }
        return true;
      }),
    [features, showArchived, showAllShipped, quarterStart],
  );

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
      const feature = featuresById.get(featureId);
      if (!feature) return;
      const overId = String(over.id);

      // Re-align: dropped onto a swimlane header → change goalId (vertical).
      const laneKey = parseLaneHeader(overId);
      if (laneKey !== null) {
        const nextGoalId = laneKeyToGoalId(laneKey);
        if (feature.goalId === nextGoalId) return;
        const nextGoal =
          nextGoalId !== null ? (goalsById.get(nextGoalId) ?? null) : null;
        setOptimisticAligns((prev) => ({ ...prev, [featureId]: nextGoal }));
        updateFeature.mutate({ id: featureId, goalId: nextGoalId });
        return;
      }

      // Status change: dropped onto a status column/cell (horizontal).
      const nextStatus = resolveTargetStatus(overId, featuresById);
      if (!nextStatus || feature.status === nextStatus) return;
      setOptimisticMoves((prev) => ({ ...prev, [featureId]: nextStatus }));
      updateFeature.mutate({ id: featureId, status: nextStatus });
    },
    [canEdit, featuresById, goalsById, updateFeature],
  );

  const activeFeature = activeId ? featuresById.get(activeId) : null;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-4 px-8 pt-4">
      <div className="flex items-center gap-2">
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
      <Tooltip
        label="By default, SHIPPED shows only features updated this quarter"
        position="bottom"
        withArrow
      >
        <Switch
          size="xs"
          label="All shipped"
          checked={showAllShipped}
          onChange={(e) => setShowAllShipped(e.currentTarget.checked)}
        />
      </Tooltip>
      <Switch
        size="xs"
        label="Show archived"
        checked={showArchived}
        onChange={(e) => setShowArchived(e.currentTarget.checked)}
      />
    </div>
  );

  if (isLoading) {
    return (
      <>
        {toolbar}
        <div className="flex gap-3 overflow-x-auto px-8 pt-4 pb-4">
          {ROADMAP_BOARD_COLUMNS.map((col) => (
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
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {groupBy === 'objective' ? (
          <SwimlaneBoard
            features={visibleFeatures}
            prefix={prefix}
            canEdit={canEdit}
            columns={columns}
          />
        ) : (
          <FlatBoard
            features={visibleFeatures}
            prefix={prefix}
            canEdit={canEdit}
            columns={columns}
          />
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
