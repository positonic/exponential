"use client";

import type { ReactNode } from "react";
import styles from "./Kanban.module.css";

interface KanbanCardProps {
  /** Shown above the card when another card is being dragged over this one. */
  showDropIndicator: boolean;
  children: ReactNode;
}

/**
 * Internal positional wrapper for a single card slot. It renders the between-card
 * drop indicator and the bespoke card content. The card itself owns its
 * `useSortable` wiring (see `KanbanBoard` docs), so this wrapper stays presentational.
 */
export function KanbanCard({ showDropIndicator, children }: KanbanCardProps) {
  return (
    <div>
      {showDropIndicator && (
        <div className={styles.kcolDropIndicator} aria-hidden="true" />
      )}
      {children}
    </div>
  );
}
