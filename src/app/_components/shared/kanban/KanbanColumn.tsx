"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "./KanbanCard";
import type { ColumnAccent } from "./types";
import styles from "./Kanban.module.css";

const ACCENT_CLASS: Record<ColumnAccent, string> = {
  slate: styles.kcolSlate!,
  brand: styles.kcolBrand!,
  amber: styles.kcolAmber!,
  violet: styles.kcolViolet!,
  green: styles.kcolGreen!,
  red: styles.kcolRed!,
};

interface KanbanColumnProps {
  id: string;
  title: string;
  accent: ColumnAccent;
  /** Ids of the items in this column, in display order (for SortableContext). */
  itemIds: string[];
  /** The card being dragged over (for the drop indicator), or null. */
  dragOverItemId: string | null;
  /** Rendered per item, in order. */
  children: (itemId: string) => ReactNode;
  columnEmptyState?: ReactNode;
}

/**
 * Internal droppable column. Data-agnostic: it knows column chrome, droppable
 * wiring, and the sortable context, but nothing about what a card contains.
 */
export function KanbanColumn({
  id,
  title,
  accent,
  itemIds,
  dragOverItemId,
  children,
  columnEmptyState,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const classes = [styles.kcol, ACCENT_CLASS[accent], isOver ? styles.kcolOver : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={classes}
      role="region"
      aria-label={`${title} column with ${itemIds.length} item${itemIds.length !== 1 ? "s" : ""}`}
    >
      <div className={styles.kcolHead}>
        <div className={styles.kcolHeadLeft}>
          <span className={styles.kcolDot} aria-hidden="true" />
          <span className={styles.kcolLabel}>{title}</span>
          <span className={styles.kcolCount}>{itemIds.length}</span>
        </div>
      </div>

      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className={styles.kcolBody}>
          {itemIds.map((itemId) => (
            <KanbanCard key={itemId} showDropIndicator={dragOverItemId === itemId}>
              {children(itemId)}
            </KanbanCard>
          ))}
          {itemIds.length === 0 && (
            <div
              className={styles.kcolEmpty}
              role="region"
              aria-label={`Empty ${title.toLowerCase()} column. Drop items here to change their status.`}
            >
              {columnEmptyState ?? "Drop items here"}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
