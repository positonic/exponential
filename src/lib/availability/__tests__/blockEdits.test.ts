import { describe, it, expect } from "vitest";

import {
  applyPlan,
  mergeRanges,
  planClear,
  planMark,
  subtractRanges,
  type EditableBlock,
} from "../blockEdits";

const at = (hhmm: string, day = "2026-10-27") => new Date(`${day}T${hhmm}:00Z`);
const range = (from: string, to: string, day?: string) => ({ startsAt: at(from, day), endsAt: at(to, day) });
const block = (
  id: string,
  from: string,
  to: string,
  extra: Partial<EditableBlock> = {},
): EditableBlock => ({ id, ...range(from, to), isAllDay: false, note: null, ...extra });
const iso = (r: { startsAt: Date; endsAt: Date }) => [
  r.startsAt.toISOString().slice(11, 16),
  r.endsAt.toISOString().slice(11, 16),
];

describe("mergeRanges", () => {
  it("joins overlapping and touching ranges and drops empty ones", () => {
    const merged = mergeRanges([
      range("11:00", "12:00"),
      range("09:00", "10:00"),
      range("10:00", "10:30"),
      range("13:00", "13:00"),
    ]);
    expect(merged.map(iso)).toEqual([
      ["09:00", "10:30"],
      ["11:00", "12:00"],
    ]);
  });
});

describe("subtractRanges", () => {
  it("returns the pieces either side of a cut", () => {
    expect(subtractRanges(range("09:00", "17:00"), [range("12:00", "13:00")]).map(iso)).toEqual([
      ["09:00", "12:00"],
      ["13:00", "17:00"],
    ]);
  });

  it("returns nothing when the cut covers the range", () => {
    expect(subtractRanges(range("10:00", "11:00"), [range("09:00", "12:00")])).toEqual([]);
  });
});

describe("planMark", () => {
  it("creates a block for a fresh range", () => {
    const plan = planMark([], [range("09:00", "10:00")]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.create.map(iso)).toEqual([["09:00", "10:00"]]);
    expect(plan.create[0]).toMatchObject({ isAllDay: false, note: null });
  });

  it("merges with plain blocks it touches on either side", () => {
    const plan = planMark(
      [block("a", "08:00", "09:00"), block("b", "10:00", "11:00")],
      [range("09:00", "10:00")],
    );
    expect(plan.deleteIds.sort()).toEqual(["a", "b"]);
    expect(plan.create.map(iso)).toEqual([["08:00", "11:00"]]);
  });

  it("is a no-op when a plain block already covers the range", () => {
    expect(planMark([block("a", "08:00", "12:00")], [range("09:00", "10:00")])).toEqual({
      deleteIds: [],
      create: [],
    });
  });

  it("leaves time a noted block holds to that block, and never merges into it", () => {
    const plan = planMark(
      [block("dentist", "10:00", "11:00", { note: "Dentist" })],
      [range("09:00", "12:00")],
    );
    expect(plan.deleteIds).toEqual([]);
    expect(plan.create.map(iso)).toEqual([
      ["09:00", "10:00"],
      ["11:00", "12:00"],
    ]);
  });

  it("does nothing over an all-day block", () => {
    const allDay: EditableBlock = {
      id: "off",
      startsAt: at("00:00"),
      endsAt: at("00:00", "2026-10-28"),
      isAllDay: true,
      note: null,
    };
    expect(planMark([allDay], [range("09:00", "10:00")]).create).toEqual([]);
  });

  it("leaves untouched blocks alone", () => {
    const plan = planMark([block("far", "15:00", "16:00")], [range("09:00", "10:00")]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.create.map(iso)).toEqual([["09:00", "10:00"]]);
  });
});

describe("planClear", () => {
  it("deletes a block the range fully covers", () => {
    expect(planClear([block("a", "09:00", "10:00")], [range("08:00", "11:00")])).toEqual({
      deleteIds: ["a"],
      create: [],
    });
  });

  it("splits a block around the cleared range, keeping its note", () => {
    const plan = planClear(
      [block("a", "09:00", "17:00", { note: "Offsite" })],
      [range("12:00", "13:00")],
    );
    expect(plan.deleteIds).toEqual(["a"]);
    expect(plan.create.map(iso)).toEqual([
      ["09:00", "12:00"],
      ["13:00", "17:00"],
    ]);
    expect(plan.create.every((b) => b.note === "Offsite")).toBe(true);
  });

  it("turns the remainder of an all-day block into timed blocks", () => {
    const allDay: EditableBlock = {
      id: "off",
      startsAt: at("00:00"),
      endsAt: at("00:00", "2026-10-28"),
      isAllDay: true,
      note: null,
    };
    const plan = planClear([allDay], [range("09:00", "10:00")]);
    expect(plan.create).toHaveLength(2);
    expect(plan.create.every((b) => !b.isAllDay)).toBe(true);
  });

  it("ignores blocks the range only touches", () => {
    expect(planClear([block("a", "09:00", "10:00")], [range("10:00", "11:00")])).toEqual({
      deleteIds: [],
      create: [],
    });
  });
});

describe("applyPlan", () => {
  it("drops deleted rows, adds created ones, and keeps the list sorted", () => {
    const existing = [block("a", "08:00", "09:00"), block("z", "15:00", "16:00")];
    const result = applyPlan(existing, planMark(existing, [range("09:00", "10:00")]), (i) => `new-${i}`);
    expect(result.map((b) => [b.id, ...iso(b)])).toEqual([
      ["new-0", "08:00", "10:00"],
      ["z", "15:00", "16:00"],
    ]);
  });
});
