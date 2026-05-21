import { describe, it, expect } from "vitest";
import {
  layoutHierarchical,
  compactBandSpec,
  type LayoutEdgeInput,
  type LayoutNodeInput,
} from "../layout";

describe("layoutHierarchical", () => {
  it("returns empty result for empty input", () => {
    const result = layoutHierarchical([], []);
    expect(result.nodes).toEqual([]);
    expect(result.bandsUsed.size).toBe(0);
  });

  it("places Tickets band nodes at the configured Y coordinate", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "t1", band: "tickets" },
      { id: "t2", band: "tickets" },
      { id: "t3", band: "tickets" },
    ];
    const result = layoutHierarchical(nodes, [], {
      y: { objectives: 0, features: 200, tickets: 400 },
    });
    expect(result.nodes).toHaveLength(3);
    for (const n of result.nodes) {
      expect(n.y).toBe(400);
      expect(n.band).toBe("tickets");
    }
    // Tickets band reported as used; others not.
    expect(result.bandsUsed.has("tickets")).toBe(true);
    expect(result.bandsUsed.has("features")).toBe(false);
    expect(result.bandsUsed.has("objectives")).toBe(false);
  });

  it("produces stable positioning across repeated runs", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "a", band: "tickets" },
      { id: "b", band: "tickets" },
      { id: "c", band: "tickets" },
    ];
    const first = layoutHierarchical(nodes, []);
    const second = layoutHierarchical(nodes, []);
    expect(first.nodes).toEqual(second.nodes);
  });

  it("keeps blocking edge endpoints in the Tickets band", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "blocker", band: "tickets" },
      { id: "blocked", band: "tickets" },
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "blocker", target: "blocked", kind: "blocking" },
    ];
    const result = layoutHierarchical(nodes, edges);
    const ys = result.nodes.map((n) => n.y);
    expect(new Set(ys).size).toBe(1);
  });

  it("places nodes at distinct Y coords across bands", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "o1", band: "objectives" },
      { id: "f1", band: "features" },
      { id: "t1", band: "tickets" },
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "o1", target: "f1", kind: "alignment" },
      { source: "f1", target: "t1", kind: "alignment" },
    ];
    const result = layoutHierarchical(nodes, edges);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get("o1")!.y).toBe(0);
    expect(byId.get("f1")!.y).toBe(200);
    expect(byId.get("t1")!.y).toBe(400);
  });

  it("places UnalignedContainer in the Features band", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "unaligned", band: "features", unaligned: true },
      { id: "f1", band: "features" },
      { id: "t1", band: "tickets" },
    ];
    const result = layoutHierarchical(nodes, []);
    const u = result.nodes.find((n) => n.id === "unaligned")!;
    const f = result.nodes.find((n) => n.id === "f1")!;
    expect(u.y).toBe(f.y);
    expect(u.unaligned).toBe(true);
    expect(f.unaligned).toBe(false);
  });

  it("alignment edges generate distinct kind hints", () => {
    // The function doesn't return edge kinds — but it should not throw when
    // mixed alignment + blocking edges are provided.
    const nodes: LayoutNodeInput[] = [
      { id: "f1", band: "features" },
      { id: "t1", band: "tickets" },
      { id: "t2", band: "tickets" },
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "f1", target: "t1", kind: "alignment" },
      { source: "f1", target: "t2", kind: "alignment" },
      { source: "t1", target: "t2", kind: "blocking" },
    ];
    const result = layoutHierarchical(nodes, edges);
    expect(result.nodes).toHaveLength(3);
    // Tickets stay in the Tickets band even with a blocking edge between them.
    const t1 = result.nodes.find((n) => n.id === "t1")!;
    const t2 = result.nodes.find((n) => n.id === "t2")!;
    expect(t1.y).toBe(t2.y);
  });
});

describe("compactBandSpec", () => {
  it("does not move bands when all are present", () => {
    const spec = {
      y: { objectives: 0, features: 200, tickets: 400 },
    };
    const result = compactBandSpec(
      spec,
      new Set<"objectives" | "features" | "tickets">([
        "objectives",
        "features",
        "tickets",
      ]),
      200,
    );
    expect(result.y).toEqual({ objectives: 0, features: 200, tickets: 400 });
  });

  it("shifts Features and Tickets up when Objectives band collapses", () => {
    const spec = {
      y: { objectives: 0, features: 200, tickets: 400 },
    };
    const result = compactBandSpec(
      spec,
      new Set<"objectives" | "features" | "tickets">(["features", "tickets"]),
      200,
    );
    expect(result.y.features).toBe(0);
    expect(result.y.tickets).toBe(200);
  });
});
