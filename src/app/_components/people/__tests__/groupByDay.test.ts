import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay } from "../groupByDay";

// Local-time constructors throughout: grouping is by the viewer's calendar day.
const NOW = new Date(2026, 10, 14, 15, 0); // Sat 14 Nov 2026, 15:00

const at = (id: string, ...when: [number, number, number, number, number]) => ({
  id,
  createdAt: new Date(...when),
});

describe("groupByDay", () => {
  it("starts a group each time the local day changes, keeping feed order", () => {
    const groups = groupByDay(
      [
        at("a", 2026, 10, 14, 14, 0),
        at("b", 2026, 10, 14, 0, 5),
        at("c", 2026, 10, 13, 23, 55),
        at("d", 2026, 10, 9, 10, 0),
      ],
      NOW,
    );

    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Monday 9 November", ["d"]],
    ]);
  });

  it("gives each day a distinct key", () => {
    const groups = groupByDay(
      [at("a", 2026, 10, 14, 9, 0), at("b", 2026, 10, 13, 9, 0)],
      NOW,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-11-14", "2026-11-13"]);
  });

  it("returns no groups for an empty feed", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe("dayLabel", () => {
  it("names the year only when it differs from the current one", () => {
    expect(dayLabel(new Date(2026, 0, 5, 12, 0), NOW)).toBe("Monday 5 January");
    expect(dayLabel(new Date(2025, 11, 31, 12, 0), NOW)).toBe(
      "Wednesday 31 December 2025",
    );
  });
});
