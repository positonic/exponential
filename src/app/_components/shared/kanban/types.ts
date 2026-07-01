import type { ReactNode } from "react";

/**
 * The fixed accent vocabulary the shared board understands (ADR-0037).
 * Boards with a fixed enum map their statuses to an accent; DB-driven boards
 * (CRM pipeline) map their stage colour onto the nearest accent token.
 */
export type ColumnAccent = "slate" | "brand" | "amber" | "violet" | "green" | "red";

/** A column on the board. `id` is matched against `KanbanItem.columnId`. */
export interface KanbanColumnDef {
  id: string;
  title: string;
  accent: ColumnAccent;
}

/**
 * The minimum shape the board needs from each item. Consumers pass their own
 * richer objects (which extend this) and receive them back in `renderCard`.
 * `items` are expected to arrive already sorted in display order per column;
 * the board preserves that order and only repositions an item while a move is
 * optimistically in flight.
 */
export interface KanbanItem {
  id: string;
  columnId: string;
}

export interface RenderCardOptions {
  /** True when the card is being rendered inside the drag overlay. */
  isOverlay: boolean;
}

export interface KanbanBoardProps<T extends KanbanItem> {
  columns: KanbanColumnDef[];
  items: T[];
  /**
   * Render one card. The card owns its own `useSortable({ id: item.id })`
   * wiring (the board provides the surrounding DndContext, droppable columns,
   * and SortableContext). `isOverlay` is true only for the drag overlay copy.
   */
  renderCard: (item: T, opts: RenderCardOptions) => ReactNode;
  /**
   * Fired when a card is dropped in a new position. The board applies the move
   * optimistically and reverts if the returned promise rejects. Each board
   * supplies its own tRPC mutation + cache invalidation here.
   */
  onMove: (itemId: string, toColumnId: string, toIndex: number) => void | Promise<unknown>;
  /** Accessible label for a11y drag announcements. Defaults to the item id. */
  getItemLabel?: (item: T) => string;
  /** Rendered instead of the board when there are no items. */
  emptyState?: ReactNode;
  /** Rendered inside a column body when that column has no items. */
  columnEmptyState?: ReactNode;
  /**
   * Bleed the board through a 32px-padded page shell so columns scroll
   * edge-to-edge (matches the Project tasks tab). Off by default.
   */
  bleed?: boolean;
  /** Merged onto the scrolling board container. */
  className?: string;
}
