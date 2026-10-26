/**
 * Pure planning for edits to a member's Availability blocks — shared by the
 * server (which applies the plan inside a transaction against the stored
 * rows) and the availability painter (which applies the same plan to its
 * cache optimistically, so a painted cell never flickers back).
 *
 * Two edits, both over half-open [startsAt, endsAt) ranges:
 *   mark  — the ranges become unavailable. A range merges with the PLAIN
 *           blocks (timed, no note) it overlaps or touches, so painting
 *           cell by cell leaves one block, not thirty. Time already covered
 *           by a noted or all-day block is left to that block.
 *   clear — the ranges become available again. Every block they overlap is
 *           cut; the pieces either side keep the block's note, and stop
 *           being all-day because they no longer span whole days.
 */

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export interface EditableBlock extends TimeRange {
  id: string;
  isAllDay: boolean;
  note: string | null;
}

export type NewBlock = Omit<EditableBlock, "id">;

export interface BlockEditPlan {
  deleteIds: string[];
  create: NewBlock[];
}

const ms = (date: Date) => date.getTime();

function isPlain(block: EditableBlock): boolean {
  return !block.isAllDay && !block.note;
}

/** Sort and union ranges; touching ranges join (half-open intervals). */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges
    .filter((r) => ms(r.endsAt) > ms(r.startsAt))
    .sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && ms(range.startsAt) <= ms(last.endsAt)) {
      if (ms(range.endsAt) > ms(last.endsAt)) last.endsAt = range.endsAt;
    } else {
      merged.push({ startsAt: range.startsAt, endsAt: range.endsAt });
    }
  }
  return merged;
}

/** `range` minus every interval in `cuts` (merged), as ordered pieces. */
export function subtractRanges(range: TimeRange, cuts: TimeRange[]): TimeRange[] {
  const pieces: TimeRange[] = [];
  let cursor = ms(range.startsAt);
  const end = ms(range.endsAt);
  for (const cut of mergeRanges(cuts)) {
    if (ms(cut.endsAt) <= cursor || ms(cut.startsAt) >= end) continue;
    if (ms(cut.startsAt) > cursor) {
      pieces.push({ startsAt: new Date(cursor), endsAt: cut.startsAt });
    }
    cursor = Math.max(cursor, ms(cut.endsAt));
  }
  if (cursor < end) pieces.push({ startsAt: new Date(cursor), endsAt: new Date(end) });
  return pieces;
}

export function planMark(existing: EditableBlock[], ranges: TimeRange[]): BlockEditPlan {
  // Time a noted or all-day block already holds stays with that block.
  const covered = existing.filter((b) => !isPlain(b));
  const toMark = mergeRanges(ranges).flatMap((r) => subtractRanges(r, covered));
  if (toMark.length === 0) return { deleteIds: [], create: [] };

  // Union the new ranges with every plain block; each resulting interval
  // that contains a new range replaces the plain blocks inside it.
  type Item = TimeRange & { blockId?: string };
  const items: Item[] = [
    ...toMark,
    ...existing.filter(isPlain).map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt, blockId: b.id })),
  ].sort((a, b) => ms(a.startsAt) - ms(b.startsAt));

  const groups: { range: TimeRange; blockIds: string[]; hasNew: boolean }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && ms(item.startsAt) <= ms(last.range.endsAt)) {
      if (ms(item.endsAt) > ms(last.range.endsAt)) last.range.endsAt = item.endsAt;
    } else {
      groups.push({ range: { startsAt: item.startsAt, endsAt: item.endsAt }, blockIds: [], hasNew: false });
    }
    const group = groups[groups.length - 1]!;
    if (item.blockId) group.blockIds.push(item.blockId);
    else group.hasNew = true;
  }

  const plan: BlockEditPlan = { deleteIds: [], create: [] };
  const byId = new Map(existing.map((b) => [b.id, b]));
  for (const group of groups) {
    if (!group.hasNew) continue;
    // Already exactly one plain block covering the whole interval: no-op.
    if (group.blockIds.length === 1) {
      const only = byId.get(group.blockIds[0]!)!;
      if (
        ms(only.startsAt) === ms(group.range.startsAt) &&
        ms(only.endsAt) === ms(group.range.endsAt)
      ) {
        continue;
      }
    }
    plan.deleteIds.push(...group.blockIds);
    plan.create.push({ ...group.range, isAllDay: false, note: null });
  }
  return plan;
}

export function planClear(existing: EditableBlock[], ranges: TimeRange[]): BlockEditPlan {
  const cuts = mergeRanges(ranges);
  const plan: BlockEditPlan = { deleteIds: [], create: [] };
  for (const block of existing) {
    const touched = cuts.some(
      (c) => ms(c.startsAt) < ms(block.endsAt) && ms(c.endsAt) > ms(block.startsAt),
    );
    if (!touched) continue;
    plan.deleteIds.push(block.id);
    for (const piece of subtractRanges(block, cuts)) {
      plan.create.push({ ...piece, isAllDay: false, note: block.note });
    }
  }
  return plan;
}

/** The plan applied to an in-memory list; `makeId` names the new rows. */
export function applyPlan(
  existing: EditableBlock[],
  plan: BlockEditPlan,
  makeId: (index: number) => string,
): EditableBlock[] {
  const deleted = new Set(plan.deleteIds);
  return [
    ...existing.filter((b) => !deleted.has(b.id)),
    ...plan.create.map((b, index) => ({ ...b, id: makeId(index) })),
  ].sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
}
