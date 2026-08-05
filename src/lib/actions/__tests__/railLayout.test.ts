import { describe, expect, it } from "vitest";
import {
  layoutRailBlock,
  MIN_RAIL_BLOCK_PX,
  RAIL_BLOCK_GAP_PX,
  RAIL_META_MIN_PX,
} from "~/lib/actions/railLayout";

/** The desktop rail's geometry; the mobile one differs only in range. */
const RAIL = { rangeStart: 7, rangeEnd: 20, hourPx: 48 };

/** A block of `minutes` starting at `startHour`. */
function block(startHour: number, minutes: number) {
  return { start: startHour, end: startHour + minutes / 60 };
}

describe("layoutRailBlock", () => {
  it("floors a 10-minute block to the minimum height", () => {
    // 10min → 8px natural, minus the gap → 4px. That was the unreadable sliver.
    const layout = layoutRailBlock(block(10.5, 10), RAIL);

    expect(layout!.height).toBe(MIN_RAIL_BLOCK_PX);
    expect(layout!.isFloored).toBe(true);
  });

  it("keeps a block's true position even when its height is floored", () => {
    const layout = layoutRailBlock(block(10.5, 10), RAIL);

    // 10:30 is 3.5h after the 7am range start → 168px. Unaffected by flooring.
    expect(layout!.top).toBe(168);
  });

  it("leaves a full-hour block at its natural height", () => {
    const layout = layoutRailBlock(block(11, 60), RAIL);

    expect(layout!.height).toBe(48 - RAIL_BLOCK_GAP_PX);
    expect(layout!.isFloored).toBe(false);
  });

  it("hides the meta line on short blocks and shows it on tall ones", () => {
    expect(layoutRailBlock(block(10, 10), RAIL)!.showMeta).toBe(false);
    expect(layoutRailBlock(block(10, 30), RAIL)!.showMeta).toBe(false);
    expect(layoutRailBlock(block(10, 60), RAIL)!.showMeta).toBe(true);
  });

  it("switches the meta line on exactly at the threshold", () => {
    // 60px/hour makes a minute exactly a pixel, so the boundary is expressible
    // without floating-point slop: height = minutes - gap.
    const perMinute = { rangeStart: 0, rangeEnd: 24, hourPx: 60 };
    const atThreshold = RAIL_META_MIN_PX + RAIL_BLOCK_GAP_PX;

    const on = layoutRailBlock(block(10, atThreshold), perMinute)!;
    const below = layoutRailBlock(block(10, atThreshold - 1), perMinute)!;

    expect(on.height).toBe(RAIL_META_MIN_PX);
    expect(on.showMeta).toBe(true);
    expect(below.height).toBe(RAIL_META_MIN_PX - 1);
    expect(below.showMeta).toBe(false);
  });

  it("rounds away float noise from the hour-float arithmetic", () => {
    // (38/60) * 60 is 37.99999999999997 in IEEE754. Unrounded that reaches the
    // DOM as `height: 33.99999999999997px` and can flip the meta threshold.
    const perMinute = { rangeStart: 0, rangeEnd: 24, hourPx: 60 };
    const layout = layoutRailBlock(block(10, 38), perMinute)!;

    expect(layout.height).toBe(34);
    expect(Number.isInteger(layout.top)).toBe(true);
  });

  it("never returns a height below the floor, for any duration", () => {
    for (const minutes of [1, 2, 5, 10, 15, 20, 25, 30, 45, 60, 120]) {
      const layout = layoutRailBlock(block(9, minutes), RAIL);
      expect(layout!.height).toBeGreaterThanOrEqual(MIN_RAIL_BLOCK_PX);
    }
  });

  it("keeps consecutive short blocks at distinct positions", () => {
    // Both are floored to the same height, so only `top` separates them —
    // which is why the CSS gives floored blocks an edge.
    const first = layoutRailBlock(block(10.5, 10), RAIL)!;
    const second = layoutRailBlock(block(10.5 + 10 / 60, 10), RAIL)!;

    expect(first.top).not.toBe(second.top);
    expect(second.top).toBeGreaterThan(first.top);
    expect(first.isFloored && second.isFloored).toBe(true);
  });

  it("drops blocks entirely outside the visible range", () => {
    expect(layoutRailBlock(block(5, 30), RAIL)).toBeNull();
    expect(layoutRailBlock(block(21, 30), RAIL)).toBeNull();
    expect(layoutRailBlock({ start: 20, end: 22 }, RAIL)).toBeNull();
  });

  it("clamps a block that straddles the start of the range", () => {
    const layout = layoutRailBlock({ start: 6, end: 8 }, RAIL);

    expect(layout!.top).toBe(0);
    expect(layout!.height).toBe(48 - RAIL_BLOCK_GAP_PX);
  });

  it("clamps a block that straddles the end of the range", () => {
    const layout = layoutRailBlock({ start: 19, end: 23 }, RAIL);

    expect(layout!.top).toBe((19 - 7) * 48);
    expect(layout!.height).toBe(48 - RAIL_BLOCK_GAP_PX);
  });

  it("works against the mobile rail's range too", () => {
    const mobile = { rangeStart: 6, rangeEnd: 22, hourPx: 48 };
    const layout = layoutRailBlock(block(10.5, 10), mobile);

    expect(layout!.top).toBe((10.5 - 6) * 48);
    expect(layout!.height).toBe(MIN_RAIL_BLOCK_PX);
  });
});
