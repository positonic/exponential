/**
 * Pure selection model for the availability painter: which times a drag
 * across the week grid covers, and whether a cell is already marked. The
 * grid layout itself (viewer-local days and rows from the server's instants)
 * comes from availabilityGridModel, shared with the schedule-meeting grid.
 */

import { mergeRanges, type TimeRange } from "~/lib/availability/blockEdits";
import type { GridLayout } from "./availabilityGridModel";

export interface GridPosition {
  dayIndex: number;
  rowIndex: number;
}

/** Monday 00:00 on the viewer's clock, for the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whether a position lies in the rectangle spanned by two corners. */
export function inSelection(
  position: GridPosition,
  anchor: GridPosition,
  current: GridPosition,
): boolean {
  return (
    position.dayIndex >= Math.min(anchor.dayIndex, current.dayIndex) &&
    position.dayIndex <= Math.max(anchor.dayIndex, current.dayIndex) &&
    position.rowIndex >= Math.min(anchor.rowIndex, current.rowIndex) &&
    position.rowIndex <= Math.max(anchor.rowIndex, current.rowIndex)
  );
}

/**
 * The times a rectangular drag covers: every loaded cell inside it, joined
 * into one range per run of consecutive cells. Rows are clamped per day, so
 * a drag over Mon–Wed 09:00–11:00 is three ranges, not one long one.
 */
export function selectionRanges(
  layout: GridLayout,
  cellStartsAt: Date[],
  cellMinutes: number,
  anchor: GridPosition,
  current: GridPosition,
): TimeRange[] {
  const cellMs = cellMinutes * 60 * 1000;
  const cells: TimeRange[] = [];
  layout.days.forEach((day, dayIndex) => {
    layout.rowMinutes.forEach((minutes, rowIndex) => {
      if (!inSelection({ dayIndex, rowIndex }, anchor, current)) return;
      const index = layout.indexAt(day.key, minutes);
      if (index === undefined) return;
      const startsAt = cellStartsAt[index]!;
      cells.push({ startsAt, endsAt: new Date(startsAt.getTime() + cellMs) });
    });
  });
  return mergeRanges(cells);
}

/** The first block overlapping [startsAt, endsAt), if any. */
export function blockAt<T extends TimeRange>(
  blocks: T[],
  startsAt: Date,
  endsAt: Date,
): T | undefined {
  return blocks.find(
    (block) =>
      block.startsAt.getTime() < endsAt.getTime() && block.endsAt.getTime() > startsAt.getTime(),
  );
}
