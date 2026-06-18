import { describe, it, expect } from "vitest";
import {
  groupTickets,
  NO_AREA_KEY,
  NO_AREA_LABEL,
  type GroupableTicket,
} from "../ticketGrouping";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type Area = { id: string; name: string };

function area(id: string, name: string) {
  return { tag: { id, name, category: "area" as const } };
}

function label(name: string) {
  // a non-area tag, must never affect Area grouping
  return { tag: { id: `lbl-${name}`, name, category: "label" as const } };
}

function ticket(id: string, areas: Area[] = [], extraTags: Array<{ tag: { id: string; name: string; category: string | null } }> = []): GroupableTicket & { id: string } {
  return {
    id,
    tags: [...areas.map((a) => area(a.id, a.name)), ...extraTags],
  };
}

const keys = (groups: Array<{ key: string }>) => groups.map((g) => g.key);
const labels = (groups: Array<{ label: string }>) => groups.map((g) => g.label);
const idsIn = (group: { items: Array<{ id: string }> }) => group.items.map((i) => i.id);

// ---------------------------------------------------------------------------

describe("groupTickets — area", () => {
  it("buckets a single Area per ticket under its Area group", () => {
    const tickets = [
      ticket("t1", [{ id: "a-api", name: "clear-api" }]),
      ticket("t2", [{ id: "a-api", name: "clear-api" }]),
    ];

    const groups = groupTickets(tickets, "area");

    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("a-api");
    expect(groups[0]!.label).toBe("clear-api");
    expect(idsIn(groups[0]!)).toEqual(["t1", "t2"]);
  });

  it("places a ticket with multiple Areas in each of its Area groups", () => {
    const tickets = [
      ticket("t1", [
        { id: "a-api", name: "clear-api" },
        { id: "a-platform", name: "clear-platform" },
      ]),
      ticket("t2", [{ id: "a-api", name: "clear-api" }]),
    ];

    const groups = groupTickets(tickets, "area");

    const byKey = Object.fromEntries(groups.map((g) => [g.key, idsIn(g)]));
    expect(byKey["a-api"]).toEqual(["t1", "t2"]);
    expect(byKey["a-platform"]).toEqual(["t1"]);
  });

  it("collects tickets with no Area in a single 'No area' bucket", () => {
    const tickets = [
      ticket("t1"),
      ticket("t2", [], [label("frontend")]), // only a non-area tag -> still no area
      ticket("t3", [{ id: "a-api", name: "clear-api" }]),
    ];

    const groups = groupTickets(tickets, "area");

    const noArea = groups.find((g) => g.key === NO_AREA_KEY);
    expect(noArea).toBeDefined();
    expect(noArea!.label).toBe(NO_AREA_LABEL);
    expect(idsIn(noArea!)).toEqual(["t1", "t2"]);
  });

  it("orders Area groups alphabetically with 'No area' pinned last", () => {
    const tickets = [
      ticket("t1", [{ id: "a-platform", name: "clear-platform" }]),
      ticket("t2"), // no area
      ticket("t3", [{ id: "a-api", name: "clear-api" }]),
      ticket("t4", [{ id: "a-pipeline", name: "clear-pipeline" }]),
    ];

    const groups = groupTickets(tickets, "area");

    expect(labels(groups)).toEqual([
      "clear-api",
      "clear-pipeline",
      "clear-platform",
      NO_AREA_LABEL,
    ]);
  });

  it("sorts alphabetically case-insensitively", () => {
    const tickets = [
      ticket("t1", [{ id: "z", name: "Zebra" }]),
      ticket("t2", [{ id: "a", name: "apple" }]),
      ticket("t3", [{ id: "m", name: "Mango" }]),
    ];

    expect(labels(groupTickets(tickets, "area"))).toEqual(["apple", "Mango", "Zebra"]);
  });

  it("returns an empty array for empty input", () => {
    expect(groupTickets([], "area")).toEqual([]);
  });
});

describe("groupTickets — non-area fields are unaffected (single-membership)", () => {
  it("groups by status with one bucket per ticket", () => {
    const tickets = [
      { id: "t1", status: "IN_PROGRESS" },
      { id: "t2", status: "IN_PROGRESS" },
      { id: "t3", status: "DONE" },
    ];

    const groups = groupTickets(tickets, "status");

    expect(keys(groups)).toEqual(["IN_PROGRESS", "DONE"]);
    expect(idsIn(groups[0]!)).toEqual(["t1", "t2"]);
    expect(idsIn(groups[1]!)).toEqual(["t3"]);
  });

  it("'none' returns a single unlabelled bucket with every ticket", () => {
    const tickets = [{ id: "t1" }, { id: "t2" }];
    const groups = groupTickets(tickets, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("all");
    expect(groups[0]!.label).toBe("");
    expect(idsIn(groups[0]!)).toEqual(["t1", "t2"]);
  });

  it("pins 'No cycle' last when grouping by cycle", () => {
    const tickets = [
      { id: "t1", cycle: null },
      { id: "t2", cycle: { name: "Cycle 1", status: "ACTIVE", startDate: "2026-01-01" } },
    ];
    const groups = groupTickets(tickets, "cycle");
    expect(keys(groups)).toEqual(["Cycle 1", "No cycle"]);
  });
});
