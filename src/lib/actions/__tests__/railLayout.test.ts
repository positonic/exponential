import { describe, expect, it } from "vitest";
import {
  layoutRailBlock,
  layoutRailBlocks,
  MAX_RAIL_LANES,
  MIN_RAIL_BLOCK_PX,
  RAIL_BLOCK_GAP_PX,
  RAIL_META_MIN_PX,
} from "~/lib/actions/railLayout";
import type { RailBlock } from "~/lib/actions/railBlocks";

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

function railBlock(
  id: string,
  startHour: number,
  minutes: number,
  kind: RailBlock["kind"] = "task",
): RailBlock {
  return { id, title: id, start: startHour, end: startHour + minutes / 60, kind };
}

describe("layoutRailBlocks", () => {
  it("gives a lone block the full rail width", () => {
    const { positioned, overflows } = layoutRailBlocks(
      [railBlock("a", 10, 60)],
      RAIL,
    );

    expect(positioned).toHaveLength(1);
    expect(positioned[0]).toMatchObject({ leftPct: 0, widthPct: 100 });
    expect(overflows).toEqual([]);
  });

  it("leaves blocks that do not collide at full width", () => {
    const { positioned } = layoutRailBlocks(
      [railBlock("a", 9, 60), railBlock("b", 11, 60)],
      RAIL,
    );

    expect(positioned.map((p) => p.widthPct)).toEqual([100, 100]);
  });

  it("splits two colliding blocks into side-by-side lanes", () => {
    const { positioned } = layoutRailBlocks(
      [railBlock("a", 10, 60), railBlock("b", 10.5, 60)],
      RAIL,
    );

    expect(positioned).toHaveLength(2);
    for (const p of positioned) expect(p.widthPct).toBeLessThan(100);
    // Distinct lanes, and they don't sit on top of each other.
    const lefts = positioned.map((p) => p.leftPct).sort((x, y) => x - y);
    expect(lefts[0]).toBe(0);
    expect(lefts[1]).toBeGreaterThan(0);
  });

  it("lays a genuine 3-way collision into three lanes with no overflow", () => {
    const { positioned, overflows } = layoutRailBlocks(
      [
        railBlock("cal", 14, 60, "cal"),
        railBlock("deep-work", 14, 45),
        railBlock("standup", 14.25, 30),
      ],
      RAIL,
    );

    expect(positioned).toHaveLength(3);
    expect(overflows).toEqual([]);
    expect(new Set(positioned.map((p) => p.leftPct)).size).toBe(3);
    for (const p of positioned) expect(p.widthPct).toBeCloseTo(33, 0);
  });

  it("caps the lanes and collapses the rest into one overflow bucket", () => {
    const blocks = Array.from({ length: 6 }, (_, i) =>
      railBlock(`b${i}`, 10, 60),
    );

    const { positioned, overflows } = layoutRailBlocks(blocks, RAIL);

    // Two lanes render; everything from the third onward is bucketed.
    expect(positioned).toHaveLength(MAX_RAIL_LANES - 1);
    expect(overflows).toHaveLength(1);
    expect(overflows[0]!.hidden).toHaveLength(6 - (MAX_RAIL_LANES - 1));
    expect(positioned.length + overflows[0]!.hidden.length).toBe(blocks.length);
  });

  it("never lets a lane fall below the readable width", () => {
    const blocks = Array.from({ length: 12 }, (_, i) =>
      railBlock(`b${i}`, 10, 60),
    );

    const { positioned, overflows } = layoutRailBlocks(blocks, RAIL);

    for (const p of positioned) expect(p.widthPct).toBeGreaterThanOrEqual(30);
    expect(overflows[0]!.widthPct).toBeGreaterThanOrEqual(30);
  });

  it("reuses a lane when a later block starts after the one above it ends", () => {
    // a and b run 10:00–11:00; c is 10:00–10:30, so d at 10:30 can sit under c
    // in the same lane. Three lanes suffice and nothing overflows.
    const { positioned, overflows } = layoutRailBlocks(
      [
        railBlock("a", 10, 60),
        railBlock("b", 10, 60),
        railBlock("c", 10, 30),
        railBlock("d", 10.5, 60),
      ],
      RAIL,
    );

    expect(positioned).toHaveLength(4);
    expect(overflows).toEqual([]);
    expect(new Set(positioned.map((p) => p.leftPct)).size).toBe(3);
  });

  it("places the overflow bucket in the last lane, spanning what it hides", () => {
    // Four blocks all covering the same hour: no lane can be reused.
    const blocks = ["a", "b", "c", "d"].map((id) => railBlock(id, 10, 60));

    const { positioned, overflows } = layoutRailBlocks(blocks, RAIL);
    const bucket = overflows[0]!;

    expect(positioned).toHaveLength(MAX_RAIL_LANES - 1);
    expect(bucket.leftPct).toBeGreaterThan(
      Math.max(...positioned.map((p) => p.leftPct)),
    );
    expect(bucket.height).toBeGreaterThanOrEqual(MIN_RAIL_BLOCK_PX);
    expect(bucket.hidden.map((h) => h.id)).toEqual(["c", "d"]);
  });

  it("keeps separate pile-ups independent of one another", () => {
    const { positioned } = layoutRailBlocks(
      [
        // A collides with B in the morning...
        railBlock("a", 9, 60),
        railBlock("b", 9.5, 60),
        // ...while C is alone in the afternoon and keeps the full width.
        railBlock("c", 15, 60),
      ],
      RAIL,
    );

    const c = positioned.find((p) => p.block.id === "c")!;
    expect(c.widthPct).toBe(100);
    expect(positioned.find((p) => p.block.id === "a")!.widthPct).toBeLessThan(100);
  });

  it("drops out-of-range blocks before laying anything out", () => {
    const { positioned, overflows } = layoutRailBlocks(
      [railBlock("early", 3, 60), railBlock("late", 22, 60)],
      RAIL,
    );

    expect(positioned).toEqual([]);
    expect(overflows).toEqual([]);
  });

  it("treats two floored short blocks as colliding when they visually do", () => {
    // 10:30 and 10:40 are only 8px apart but both render 22px tall, so they
    // overlap on screen even though their durations do not.
    const { positioned } = layoutRailBlocks(
      [railBlock("a", 10.5, 10), railBlock("b", 10.5 + 10 / 60, 10)],
      RAIL,
    );

    expect(positioned).toHaveLength(2);
    for (const p of positioned) expect(p.widthPct).toBeLessThan(100);
  });

  it("returns nothing for no blocks", () => {
    expect(layoutRailBlocks([], RAIL)).toEqual({ positioned: [], overflows: [] });
  });
});

describe("layoutRailBlocks overflow key", () => {
  it("stays stable when the input order changes", () => {
    const blocks = ["a", "b", "c", "d"].map((id) => railBlock(id, 10, 60));

    const forward = layoutRailBlocks(blocks, RAIL).overflows[0]!.key;
    const reversed = layoutRailBlocks([...blocks].reverse(), RAIL).overflows[0]!.key;

    // The panel's open/closed identity must survive a refetch that reorders
    // the list, so the key can't depend on which block lands first.
    expect(forward).toBe(reversed);
  });

  it("differs between separate pile-ups", () => {
    const morning = ["a", "b", "c", "d"].map((id) => railBlock(id, 9, 60));
    const afternoon = ["e", "f", "g", "h"].map((id) => railBlock(id, 15, 60));

    const { overflows } = layoutRailBlocks([...morning, ...afternoon], RAIL);

    expect(overflows).toHaveLength(2);
    expect(overflows[0]!.key).not.toBe(overflows[1]!.key);
  });
});
