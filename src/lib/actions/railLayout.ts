import type { RailBlock } from "~/lib/actions/railBlocks";

/**
 * Geometry for the Today agenda rail, shared by the desktop rail
 * (`AgendaRail`) and the mobile one (`TimelineRail`) so the two can't drift.
 */

/**
 * Floor for a block's rendered height. The rail draws an hour as 48px, so a
 * 10-minute block is 8px — less than its own padding, which clipped the title
 * to a sliver of colour. 22px is the smallest height that fits one line of
 * title text plus the block's vertical padding.
 */
export const MIN_RAIL_BLOCK_PX = 22;

/**
 * Below this rendered height a block shows its title only. Padding plus a
 * title line plus a time line needs roughly 34px; the title is the part that
 * matters, and the time is already implied by the block's position against the
 * hour gutter.
 */
export const RAIL_META_MIN_PX = 34;

/** Breathing room between stacked blocks, subtracted from the natural height. */
export const RAIL_BLOCK_GAP_PX = 4;

export interface RailBlockLayout {
  /** Offset from the top of the rail, in px. Always the block's true start. */
  top: number;
  /** Rendered height in px — floored at `MIN_RAIL_BLOCK_PX`. */
  height: number;
  /** Whether there is room for the secondary time line. */
  showMeta: boolean;
  /** True when the floor kicked in, i.e. the block is drawn taller than it is. */
  isFloored: boolean;
}

export interface RailLayoutOptions {
  /** First hour drawn on the rail. */
  rangeStart: number;
  /** Last hour drawn on the rail. */
  rangeEnd: number;
  /** Pixels per hour. */
  hourPx: number;
  gapPx?: number;
}

/**
 * Place one block on the rail, or `null` when it falls entirely outside the
 * visible range.
 *
 * Only the *height* is floored — `top` always reflects the block's true start
 * time, so a short block still sits at the right place against the gutter even
 * though it is drawn taller than its duration.
 */
export function layoutRailBlock(
  block: Pick<RailBlock, "start" | "end">,
  { rangeStart, rangeEnd, hourPx, gapPx = RAIL_BLOCK_GAP_PX }: RailLayoutOptions,
): RailBlockLayout | null {
  const clampedStart = Math.max(block.start, rangeStart);
  const clampedEnd = Math.min(block.end, rangeEnd);
  if (clampedEnd <= clampedStart) return null;

  // Hour floats come from dividing minutes by 60, so multiplying back by
  // hourPx leaves float noise — a 38px block computes as 37.99999999999997.
  // Left alone that both flips the `showMeta` threshold at its boundary and
  // sends absurd style strings to the DOM.
  const naturalHeight = roundPx((clampedEnd - clampedStart) * hourPx - gapPx);
  const height = Math.max(naturalHeight, MIN_RAIL_BLOCK_PX);

  return {
    top: roundPx((clampedStart - rangeStart) * hourPx),
    height,
    showMeta: height >= RAIL_META_MIN_PX,
    isFloored: height > naturalHeight,
  };
}

function roundPx(px: number): number {
  return Math.round(px * 100) / 100;
}
