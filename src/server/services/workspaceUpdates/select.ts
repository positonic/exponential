import { groupIntoStories } from "./stories";
import type { ShippedItem, UpdateSelection } from "./types";

/** At most this many items get a highlight paragraph. */
export const MAX_HIGHLIGHTS = 3;
/** At most this many further items get a one-line mention. */
export const MAX_ALSO = 8;

/**
 * Group what shipped into stories, then rank and cap them — deterministically,
 * before any model sees them, so an update can only ever mention work that
 * actually shipped (the PRD's CONSTRAINT requirement) and never runs past two
 * minutes of reading.
 *
 * Order of importance (see `SOURCE_WEIGHT` / `TICKET_TYPE_WEIGHT`): a feature
 * going Live, then a feature reaching a milestone, then a cycle's results, then
 * finished features, improvements and fixes. Within a level, a story with more
 * shipped pieces ranks higher (`groupIntoStories`'s `size`), then the most
 * recent. Breadth only breaks ties, so it never lifts a story above a more
 * newsworthy kind of change.
 * Chores, spikes and research are never selected or counted.
 */
export function selectItems(items: ShippedItem[]): UpdateSelection {
  const selectable = groupIntoStories(items).sort(
    (a, b) =>
      b.weight - a.weight ||
      (b.size ?? 1) - (a.size ?? 1) ||
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
