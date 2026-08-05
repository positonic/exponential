import {
  buildOverlapClusters,
  calculateOverlappingPositions,
  type CalendarItem,
  type PositionedCalendarItem,
} from "~/app/_components/calendar/utils/overlapDetection";
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

/**
 * The rail is only ~280px wide, so columns cannot subdivide indefinitely.
 * Past three lanes each block is too narrow to read a title in, which is worse
 * than hiding the overflow behind a count.
 */
export const MAX_RAIL_LANES = 3;

/** Gap between lanes, as a percentage of the rail's width. */
const LANE_GAP_PCT = 0.5;

/** A block with both its vertical geometry and its horizontal lane. */
export interface PositionedRailBlock extends RailBlockLayout {
  block: RailBlock;
  /** Percentage offset from the rail's left edge. */
  leftPct: number;
  /** Percentage of the rail's width. */
  widthPct: number;
}

/** The "+N more" affordance standing in for a cluster's hidden blocks. */
export interface RailOverflow {
  key: string;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  hidden: RailBlock[];
}

export interface RailLayoutResult {
  positioned: PositionedRailBlock[];
  overflows: RailOverflow[];
}

function laneGeometry(lane: number, lanes: number): { leftPct: number; widthPct: number } {
  const gaps = lanes > 1 ? (lanes - 1) * LANE_GAP_PCT : 0;
  const widthPct = (100 - gaps) / lanes;
  return { leftPct: lane * (widthPct + LANE_GAP_PCT), widthPct };
}

/**
 * Lay every block out on the rail, giving colliding blocks side-by-side lanes.
 *
 * Clustering and column assignment both come from the calendar's
 * `overlapDetection` utility — the same code the full day grid uses — so the
 * two views agree about what collides. This adds only what the rail needs on
 * top: a lane cap, and the overflow bucket that cap implies.
 *
 * Collision is measured against *rendered* geometry, not raw duration, so two
 * blocks floored to the minimum height are treated as colliding when they
 * visually do — which is exactly when they need separate lanes.
 */
export function layoutRailBlocks(
  blocks: RailBlock[],
  options: RailLayoutOptions,
): RailLayoutResult {
  const placed: Array<{ block: RailBlock; geom: RailBlockLayout }> = [];
  for (const block of blocks) {
    const geom = layoutRailBlock(block, options);
    if (geom) placed.push({ block, geom });
  }
  if (placed.length === 0) return { positioned: [], overflows: [] };

  const byId = new Map(placed.map((p) => [p.block.id, p]));
  const items: CalendarItem[] = placed.map(({ block, geom }) => ({
    id: block.id,
    type: block.kind === "cal" ? "event" : "action",
    top: geom.top,
    height: geom.height,
    startMinutes: block.start * 60,
    endMinutes: block.end * 60,
  }));

  const positioned: PositionedRailBlock[] = [];
  const overflows: RailOverflow[] = [];

  const seeded: PositionedCalendarItem[] = items.map((item) => ({
    ...item,
    left: 0,
    width: 100,
    column: 0,
    totalColumns: 1,
  }));

  for (const cluster of buildOverlapClusters(seeded)) {
    // Re-run the shared column assignment per cluster so `column` reflects this
    // cluster alone; `buildOverlapClusters` only groups, it doesn't assign.
    const laidOut = calculateOverlappingPositions(cluster, 100, 0);
    const lanes = Math.max(...laidOut.map((i) => i.totalColumns), 1);

    if (lanes <= MAX_RAIL_LANES) {
      for (const item of laidOut) {
        const entry = byId.get(item.id);
        if (!entry) continue;
        positioned.push({
          ...entry.geom,
          block: entry.block,
          leftPct: round2(item.left),
          widthPct: round2(item.width),
        });
      }
      continue;
    }

    // Over the cap: the first lanes render as usual, and everything from the
    // last lane onward collapses into one "+N more" bucket.
    const visibleLanes = MAX_RAIL_LANES - 1;
    const hidden: RailBlock[] = [];
    let overflowTop = Infinity;
    let overflowBottom = -Infinity;

    for (const item of laidOut) {
      const entry = byId.get(item.id);
      if (!entry) continue;
      if (item.column < visibleLanes) {
        const { leftPct, widthPct } = laneGeometry(item.column, MAX_RAIL_LANES);
        positioned.push({
          ...entry.geom,
          block: entry.block,
          leftPct: round2(leftPct),
          widthPct: round2(widthPct),
        });
      } else {
        hidden.push(entry.block);
        overflowTop = Math.min(overflowTop, entry.geom.top);
        overflowBottom = Math.max(overflowBottom, entry.geom.top + entry.geom.height);
      }
    }

    if (hidden.length > 0) {
      const { leftPct, widthPct } = laneGeometry(visibleLanes, MAX_RAIL_LANES);
      overflows.push({
        // Keyed by where the pile-up sits, not by which block happens to land
        // first in it. The key doubles as the panel's open/closed identity, so
        // deriving it from block order would slam the panel shut on any
        // refetch that reorders the list.
        key: `overflow-${overflowTop}`,
        top: overflowTop,
        height: Math.max(overflowBottom - overflowTop, MIN_RAIL_BLOCK_PX),
        leftPct: round2(leftPct),
        widthPct: round2(widthPct),
        hidden,
      });
    }
  }

  return { positioned, overflows };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
