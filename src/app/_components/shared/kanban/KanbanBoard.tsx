"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, DragOverEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import type { KanbanBoardProps, KanbanItem } from "./types";
import styles from "./Kanban.module.css";

/**
 * Presentation-only, data-agnostic Kanban board (ADR-0037).
 *
 * Owns: dnd-kit wiring (DndContext, sensors, collision, DragOverlay), droppable
 * columns, the between-card drop indicator, a11y announcements, and the shared
 * optimistic-move state machine (a card jumps columns immediately on drop and
 * reverts if `onMove` rejects; intra-column ordering settles when the consumer
 * refetches, matching every existing board's behaviour).
 *
 * Knows nothing about Actions / Deals / Insights / tRPC. Each board supplies its
 * columns, pre-sorted items, a bespoke `renderCard`, and an `onMove` mutation.
 *
 * Card contract: each bespoke card owns its own
 * `useSortable({ id: item.id })` — the board provides the surrounding
 * DndContext + SortableContext; the card provides the draggable node.
 */
export function KanbanBoard<T extends KanbanItem>({
  columns,
  items,
  renderCard,
  onMove,
  getItemLabel,
  emptyState,
  columnEmptyState,
  bleed = false,
  className,
}: KanbanBoardProps<T>) {
  // Pending column overrides: itemId -> optimistic columnId.
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const isMovingRef = useRef(false);

  const columnIds = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);
  const itemById = useMemo(() => {
    const map = new Map<string, T>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const label = useCallback(
    (id: string) => {
      const item = itemById.get(id);
      return item && getItemLabel ? getItemLabel(item) : id;
    },
    [itemById, getItemLabel],
  );

  // Effective column for an item, applying any pending optimistic override.
  const effectiveColumn = useCallback(
    (item: T) => optimistic[item.id] ?? item.columnId,
    [optimistic],
  );

  // Prune overrides the server has caught up with (keeps `optimistic` bounded).
  useEffect(() => {
    setOptimistic((prev) => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const [id, colId] of Object.entries(prev)) {
        const item = itemById.get(id);
        if (item && item.columnId === colId) {
          changed = true; // server agrees — drop the override
        } else {
          next[id] = colId;
        }
      }
      return changed ? next : prev;
    });
  }, [itemById]);

  // Group item ids per column, in input (display) order, applying overrides.
  const itemIdsByColumn = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const col of columns) groups[col.id] = [];
    for (const item of items) {
      const colId = effectiveColumn(item);
      groups[colId]?.push(item.id);
    }
    return groups;
  }, [columns, items, effectiveColumn]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setDragOverItemId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    setDragOverItemId(overId && !columnIds.has(overId) ? overId : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDragOverItemId(null);
    setActiveId(null);

    if (!over) return;

    const itemId = active.id as string;
    const dragged = itemById.get(itemId);
    if (!dragged) return;

    // Ignore drops while a previous move is still settling (matches prior boards).
    if (isMovingRef.current) return;

    const overId = over.id as string;
    const droppedOnColumn = columnIds.has(overId);

    // Resolve the target column: a column drop uses the column id; a card drop
    // uses that card's (effective) column.
    let toColumnId: string;
    if (droppedOnColumn) {
      toColumnId = overId;
    } else {
      const overItem = itemById.get(overId);
      if (!overItem) return;
      toColumnId = effectiveColumn(overItem);
    }

    // Insertion index within the target column's display list. Dropping on a
    // column appends; dropping on a card targets that card's slot.
    const targetIds = itemIdsByColumn[toColumnId] ?? [];
    const toIndex = droppedOnColumn
      ? targetIds.length
      : Math.max(0, targetIds.indexOf(overId));

    const currentColumnId = effectiveColumn(dragged);

    // No-op: same column and not targeting a specific card (nothing to reorder).
    if (currentColumnId === toColumnId && droppedOnColumn) return;

    // Apply the optimistic column move up-front, then fire the injected mutation.
    setOptimistic((prev) => ({ ...prev, [itemId]: toColumnId }));
    isMovingRef.current = true;

    void Promise.resolve(onMove(itemId, toColumnId, toIndex))
      .catch(() => {
        // Revert the optimistic move; the consumer's onError restores its cache.
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      })
      .finally(() => {
        isMovingRef.current = false;
      });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setDragOverItemId(null);
  };

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const activeItem = activeId ? itemById.get(activeId) : null;
  const boardClassName = [styles.kboard, bleed ? styles.kboardBleed : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="w-full" role="application" aria-label="Kanban board">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements: {
            onDragStart({ active }) {
              return `Started dragging ${label(active.id as string)}`;
            },
            onDragOver({ active, over }) {
              if (!over) return `${label(active.id as string)} is no longer over a droppable area`;
              const overId = over.id as string;
              if (columnIds.has(overId)) {
                const col = columns.find((c) => c.id === overId);
                return `${label(active.id as string)} is over ${col?.title ?? overId} column`;
              }
              return `${label(active.id as string)} is over ${label(overId)}`;
            },
            onDragEnd({ active, over }) {
              if (!over) return `${label(active.id as string)} was dropped`;
              const overId = over.id as string;
              if (columnIds.has(overId)) {
                const col = columns.find((c) => c.id === overId);
                return `${label(active.id as string)} was moved to ${col?.title ?? overId} column`;
              }
              return `${label(active.id as string)} was placed near ${label(overId)}`;
            },
            onDragCancel({ active }) {
              return `Dragging ${label(active.id as string)} was cancelled`;
            },
          },
        }}
      >
        <div className={boardClassName}>
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              accent={column.accent}
              itemIds={itemIdsByColumn[column.id] ?? []}
              dragOverItemId={dragOverItemId}
              columnEmptyState={columnEmptyState}
            >
              {(itemId) => {
                const item = itemById.get(itemId);
                return item ? renderCard(item, { isOverlay: false }) : null;
              }}
            </KanbanColumn>
          ))}
        </div>

        <DragOverlay>
          {activeItem ? renderCard(activeItem, { isOverlay: true }) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
