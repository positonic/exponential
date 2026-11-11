import { describe, it, expect } from "vitest";

import { buildGridLayout } from "../availabilityGridModel";
import { addDays, blockAt, inSelection, selectionRanges, startOfWeek } from "../availabilityPainterModel";

/** Local-time cells (the painter renders on the viewer's clock). */
function weekCells(days: number, fromHour: number, toHour: number): Date[] {
  const cells: Date[] = [];
  for (let day = 0; day < days; day++) {
    for (let minutes = fromHour * 60; minutes < toHour * 60; minutes += 30) {
      cells.push(new Date(2026, 10, 2 + day, Math.floor(minutes / 60), minutes % 60));
    }
  }
  return cells;
}

describe("startOfWeek", () => {
  it("returns Monday midnight for any day of the week", () => {
    const monday = new Date(2026, 10, 2);
    expect(startOfWeek(new Date(2026, 10, 2, 15, 30))).toEqual(monday);
    expect(startOfWeek(new Date(2026, 10, 8, 23, 0))).toEqual(monday); // Sunday
    expect(addDays(monday, 7)).toEqual(new Date(2026, 10, 9));
  });
});

describe("inSelection", () => {
  it("accepts corners in either order", () => {
    const a = { dayIndex: 2, rowIndex: 5 };
    const b = { dayIndex: 0, rowIndex: 1 };
    expect(inSelection({ dayIndex: 1, rowIndex: 3 }, a, b)).toBe(true);
    expect(inSelection({ dayIndex: 3, rowIndex: 3 }, a, b)).toBe(false);
  });
});

describe("selectionRanges", () => {
  const cells = weekCells(3, 9, 12);
  const layout = buildGridLayout(cells, 30);

  it("gives one range per day for a rectangle across days", () => {
    // Rows 0..1 = 09:00–10:00, days 0..2.
    const ranges = selectionRanges(layout, cells, 30, { dayIndex: 0, rowIndex: 0 }, { dayIndex: 2, rowIndex: 1 });
    expect(ranges).toEqual([0, 1, 2].map((day) => ({
      startsAt: new Date(2026, 10, 2 + day, 9, 0),
      endsAt: new Date(2026, 10, 2 + day, 10, 0),
    })));
  });

  it("gives a single 30-minute range for a click", () => {
    const ranges = selectionRanges(layout, cells, 30, { dayIndex: 1, rowIndex: 4 }, { dayIndex: 1, rowIndex: 4 });
    expect(ranges).toEqual([
      { startsAt: new Date(2026, 10, 3, 11, 0), endsAt: new Date(2026, 10, 3, 11, 30) },
    ]);
  });
});

describe("blockAt", () => {
  it("finds a block overlapping the cell and ignores one that only touches it", () => {
    const blocks = [
      { id: "a", startsAt: new Date(2026, 10, 2, 9, 0), endsAt: new Date(2026, 10, 2, 10, 0) },
    ];
    expect(blockAt(blocks, new Date(2026, 10, 2, 9, 30), new Date(2026, 10, 2, 10, 0))?.id).toBe("a");
    expect(blockAt(blocks, new Date(2026, 10, 2, 10, 0), new Date(2026, 10, 2, 10, 30))).toBeUndefined();
  });
});
