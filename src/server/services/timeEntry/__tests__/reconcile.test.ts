/**
 * Table-driven tests for the manual-wins rules (pure, no mocks).
 * Times are minutes after an arbitrary origin; `t(14, 50)` is 14:50.
 */

import { describe, it, expect } from "vitest";
import { reconcileProposed, appendReference, type ManualInterval } from "../reconcile";

const t = (h: number, m: number) => (h * 60 + m) * 60_000;

const manualA: ManualInterval = { id: "m1", actionId: "A", startMs: t(14, 50), endMs: t(15, 30) };

describe("reconcileProposed — same Action", () => {
  it("drops the proposal and names the manual entry to annotate", () => {
    const result = reconcileProposed([manualA], {
      actionId: "A",
      startMs: t(14, 57),
      endMs: t(15, 22),
      sourceRef: "claude-session:s1#0",
    });
    expect(result).toEqual({ kind: "merge", mergeInto: ["m1"], pieces: [] });
  });

  it("merges on any overlap, however small, and into every overlapping manual entry", () => {
    const manualA2: ManualInterval = { id: "m2", actionId: "A", startMs: t(16, 0), endMs: t(16, 30) };
    const result = reconcileProposed([manualA, manualA2], {
      actionId: "A",
      startMs: t(15, 29),
      endMs: t(16, 1),
      sourceRef: "r",
    });
    expect(result.kind).toBe("merge");
    expect(result.mergeInto).toEqual(["m1", "m2"]);
  });

  it("touching at the boundary is not an overlap", () => {
    const result = reconcileProposed([manualA], {
      actionId: "A",
      startMs: t(15, 30),
      endMs: t(16, 0),
      sourceRef: "r",
    });
    expect(result.kind).toBe("write");
    expect(result.pieces).toHaveLength(1);
  });
});

describe("reconcileProposed — no manual overlap", () => {
  it("writes the proposal untouched with its own ref", () => {
    const result = reconcileProposed([manualA], {
      actionId: "B",
      startMs: t(9, 22),
      endMs: t(10, 30),
      sourceRef: "claude-session:s1#0",
    });
    expect(result).toEqual({
      kind: "write",
      mergeInto: [],
      pieces: [{ actionId: "B", startMs: t(9, 22), endMs: t(10, 30), sourceRef: "claude-session:s1#0" }],
    });
  });

  it("with no manual entries at all", () => {
    const result = reconcileProposed([], { actionId: "B", startMs: t(9, 0), endMs: t(9, 30), sourceRef: "r" });
    expect(result.kind).toBe("write");
    expect(result.pieces).toHaveLength(1);
  });
});

describe("reconcileProposed — different Action (manual wins minute by minute)", () => {
  const propose = (startMs: number, endMs: number, manual = [manualA]) =>
    reconcileProposed(manual, { actionId: "B", startMs, endMs, sourceRef: "claude-session:s1#0" });

  it("fully covered → nothing to write", () => {
    expect(propose(t(15, 13), t(15, 20))).toEqual({ kind: "write", mergeInto: [], pieces: [] });
  });

  it("straddling → split into two pieces with #a and #b refs", () => {
    const result = propose(t(14, 0), t(16, 0));
    expect(result.pieces).toEqual([
      { actionId: "B", startMs: t(14, 0), endMs: t(14, 50), sourceRef: "claude-session:s1#0#a" },
      { actionId: "B", startMs: t(15, 30), endMs: t(16, 0), sourceRef: "claude-session:s1#0#b" },
    ]);
  });

  it("clipped at one end → one piece that keeps the original ref", () => {
    expect(propose(t(14, 0), t(15, 0)).pieces).toEqual([
      { actionId: "B", startMs: t(14, 0), endMs: t(14, 50), sourceRef: "claude-session:s1#0" },
    ]);
    expect(propose(t(15, 0), t(16, 0)).pieces).toEqual([
      { actionId: "B", startMs: t(15, 30), endMs: t(16, 0), sourceRef: "claude-session:s1#0" },
    ]);
  });

  it("a remainder under 5 minutes is dropped; exactly 5 minutes survives", () => {
    // 14:46–15:00 → 14:46–14:50 is 4 minutes: gone.
    expect(propose(t(14, 46), t(15, 0)).pieces).toEqual([]);
    // 14:45–15:00 → 14:45–14:50 is 5 minutes: kept, with its own ref.
    expect(propose(t(14, 45), t(15, 0)).pieces).toEqual([
      { actionId: "B", startMs: t(14, 45), endMs: t(14, 50), sourceRef: "claude-session:s1#0" },
    ]);
    // Split where one side is too short: the survivor is the only piece, so no suffix.
    expect(propose(t(14, 47), t(16, 0)).pieces).toEqual([
      { actionId: "B", startMs: t(15, 30), endMs: t(16, 0), sourceRef: "claude-session:s1#0" },
    ]);
  });

  it("several manual entries carve several holes", () => {
    const manualC = { id: "m3", actionId: "C", startMs: t(15, 45), endMs: t(15, 50) };
    const result = propose(t(14, 0), t(16, 0), [manualA, manualC]);
    expect(result.pieces.map((p) => [p.startMs / 60_000, p.endMs / 60_000, p.sourceRef])).toEqual([
      [14 * 60, 14 * 60 + 50, "claude-session:s1#0#a"],
      [15 * 60 + 30, 15 * 60 + 45, "claude-session:s1#0#b"],
      [15 * 60 + 50, 16 * 60, "claude-session:s1#0#c"],
    ]);
  });

  it("a manual entry on the same Action still wins over clipping", () => {
    const manualB = { id: "m4", actionId: "B", startMs: t(15, 40), endMs: t(15, 50) };
    const result = propose(t(14, 0), t(16, 0), [manualA, manualB]);
    expect(result.kind).toBe("merge");
    expect(result.mergeInto).toEqual(["m4"]);
  });
});

describe("appendReference", () => {
  it("starts a note, appends once, never duplicates", () => {
    expect(appendReference(null, "r1")).toBe("r1");
    expect(appendReference("PR 642", "r1")).toBe("PR 642 · r1");
    expect(appendReference("PR 642 · r1", "r1")).toBe("PR 642 · r1");
  });
});
