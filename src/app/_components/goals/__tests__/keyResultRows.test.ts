import { describe, it, expect } from "vitest";
import {
  defaultSortDirection,
  flattenKeyResultRows,
  formatKrValue,
  sortKeyResultRows,
  type KeyResultRowData,
} from "../keyResultRows";
import type { ObjectiveCardObjective } from "~/plugins/okr/client/components/ObjectiveCardV2";

const user = (id: string, name: string | null) => ({ id, name, email: null, image: null });

const objectives: ObjectiveCardObjective[] = [
  {
    id: 1,
    title: "Grow revenue",
    progress: 50,
    keyResults: [
      {
        id: "kr-a",
        title: "ARR to 2M",
        currentValue: 1_200_000,
        targetValue: 2_000_000,
        startValue: 1_000_000,
        unit: "currency",
        status: "at-risk",
        statusOverride: "on-track",
        driUser: user("u1", "Ada"),
        checkIns: [
          { id: "c2", newValue: 1_200_000, createdAt: new Date("2026-10-20"), note: null },
          { id: "c1", newValue: 1_100_000, createdAt: new Date("2026-10-01"), note: null },
        ],
      },
      {
        id: "kr-b",
        title: "Churn under 3%",
        currentValue: 5,
        targetValue: 3,
        startValue: 5,
        unit: "percent",
        status: "off-track",
        driUser: null,
        checkIns: [],
      },
    ],
  },
  {
    id: 2,
    title: "Delight users",
    progress: 0,
    keyResults: [
      {
        id: "kr-c",
        title: "NPS to 60",
        currentValue: 40,
        targetValue: 60,
        startValue: 20,
        unit: "count",
        status: "not-started",
        driUser: user("u2", "Grace"),
      },
    ],
  },
];

describe("flattenKeyResultRows", () => {
  const rows = flattenKeyResultRows(objectives);

  it("emits one row per key result, carrying its objective", () => {
    expect(rows.map((r) => [r.id, r.objectiveTitle])).toEqual([
      ["kr-a", "Grow revenue"],
      ["kr-b", "Grow revenue"],
      ["kr-c", "Delight users"],
    ]);
  });

  it("reads the effective status (override wins) and buckets it", () => {
    const a = rows.find((r) => r.id === "kr-a")!;
    expect(a.effectiveStatus).toBe("on-track");
    expect(a.confidence).toBe("ok");
    expect(rows.find((r) => r.id === "kr-b")!.confidence).toBe("bad");
    expect(rows.find((r) => r.id === "kr-c")!.confidence).toBe("idle");
  });

  it("computes start→target progress and the latest check-in", () => {
    const a = rows.find((r) => r.id === "kr-a")!;
    expect(a.progress).toBe(20);
    expect(a.lastCheckInAt?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(rows.find((r) => r.id === "kr-b")!.lastCheckInAt).toBeNull();
    expect(rows.find((r) => r.id === "kr-c")!.progress).toBe(50);
  });
});

describe("formatKrValue", () => {
  it("is unit-aware", () => {
    expect(formatKrValue(40.4, "percent", null)).toBe("40%");
    expect(formatKrValue(1200, "currency", null)).toBe("$1,200");
    expect(formatKrValue(12, "hours", null)).toBe("12h");
    expect(formatKrValue(7, "custom", "deals")).toBe("7 deals");
    expect(formatKrValue(7, "count", null)).toBe("7");
  });
});

describe("sortKeyResultRows", () => {
  const rows = flattenKeyResultRows(objectives);
  const ids = (xs: KeyResultRowData[]) => xs.map((r) => r.id);

  it("returns the rows untouched with no sort", () => {
    expect(sortKeyResultRows(rows, null)).toBe(rows);
  });

  it("sorts by progress descending and never mutates the input", () => {
    const before = ids(rows);
    expect(ids(sortKeyResultRows(rows, { field: "progress", direction: "desc" }))).toEqual([
      "kr-c",
      "kr-a",
      "kr-b",
    ]);
    expect(ids(rows)).toEqual(before);
  });

  it("sorts by status worst-first ascending, best-first descending", () => {
    expect(ids(sortKeyResultRows(rows, { field: "status", direction: "asc" }))).toEqual([
      "kr-b",
      "kr-c",
      "kr-a",
    ]);
    expect(ids(sortKeyResultRows(rows, { field: "status", direction: "desc" }))).toEqual([
      "kr-a",
      "kr-c",
      "kr-b",
    ]);
  });

  it("sinks missing owners and check-ins to the end in either direction", () => {
    expect(ids(sortKeyResultRows(rows, { field: "owner", direction: "asc" }))).toEqual([
      "kr-a",
      "kr-c",
      "kr-b",
    ]);
    expect(ids(sortKeyResultRows(rows, { field: "owner", direction: "desc" }))).toEqual([
      "kr-c",
      "kr-a",
      "kr-b",
    ]);
    expect(ids(sortKeyResultRows(rows, { field: "lastCheckIn", direction: "desc" }))).toEqual([
      "kr-a",
      "kr-b",
      "kr-c",
    ]);
  });

  it("breaks ties by title so equal values keep a stable order", () => {
    const tied = rows.map((r) => ({ ...r, progress: 10 }));
    expect(ids(sortKeyResultRows(tied, { field: "progress", direction: "asc" }))).toEqual([
      "kr-a",
      "kr-b",
      "kr-c",
    ]);
  });

  it("picks a sensible default direction per column", () => {
    expect(defaultSortDirection("progress")).toBe("desc");
    expect(defaultSortDirection("lastCheckIn")).toBe("desc");
    expect(defaultSortDirection("title")).toBe("asc");
  });
});
