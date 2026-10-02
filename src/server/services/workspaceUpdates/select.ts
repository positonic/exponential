import type { ShippedItem, UpdateSelection } from "./types";

/** At most this many items get a highlight paragraph. */
export const MAX_HIGHLIGHTS = 3;
/** At most this many further items get a one-line mention. */
export const MAX_ALSO = 8;

/**
 * Rank and cap what shipped — deterministically, before any model sees it, so
 * an update can only ever mention work that actually shipped (the PRD's
 * CONSTRAINT requirement) and never runs past two minutes of reading.
 *
 * Items with weight 0 (chores, spikes, research) are never selected or counted.
 * Ties break on the most recent first, then on id for a stable order.
 */
export function selectItems(items: ShippedItem[]): UpdateSelection {
  const selectable = items
    .filter((item) => item.weight > 0)
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.at.localeCompare(a.at) ||
        a.id.localeCompare(b.id),
    );

  return {
    highlights: selectable.slice(0, MAX_HIGHLIGHTS),
    also: selectable.slice(MAX_HIGHLIGHTS, MAX_HIGHLIGHTS + MAX_ALSO),
    moreCount: Math.max(0, selectable.length - MAX_HIGHLIGHTS - MAX_ALSO),
  };
}

export function isSelectionEmpty(selection: UpdateSelection): boolean {
  return selection.highlights.length === 0;
}
